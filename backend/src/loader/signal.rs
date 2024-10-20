///! Huge kudos to https://github.com/tbvdm/sigtop making this implementation possible!

use super::DataLoader;
use crate::prelude::client::UserInputRequester;
use crate::prelude::*;

use std::fs;
use std::path::Path;

use itertools::Itertools;

use message_service::SealedValueOptional as ServiceSvo;

use base64::prelude::*;
use cbc::cipher::{BlockDecryptMut, KeyIvInit};
use hmac::Mac;
use rusqlite::Connection;
use simd_json::base::*;
use simd_json::borrowed::{Object, Value};
use simd_json::derived::*;
use uuid::Uuid;

#[cfg(test)]
#[path = "signal_tests.rs"]
mod tests;

pub struct SignalDataLoader;

const NAME: &'static str = "Signal";

const ENCRYPTED_DB_FILENAME: &'static str = "db.sqlite";
const PLAINTEXT_DB_FILENAME: &'static str = "plaintext.sqlite";

const ATTACHMENTS_DIR_NAME: &'static str = "attachments.noindex";
const DECRYPTED_ATTACHMENTS_DIR_NAME: &'static str = "_decrypted";

impl DataLoader for SignalDataLoader {
    fn name(&self) -> String { NAME.to_owned() }

    fn looks_about_right_inner(&self, path: &Path) -> EmptyRes {
        let file_name = path_file_name(path)?;
        if file_name != ENCRYPTED_DB_FILENAME && file_name != PLAINTEXT_DB_FILENAME {
            bail!("File is not {ENCRYPTED_DB_FILENAME} nor {PLAINTEXT_DB_FILENAME}")
        }
        Ok(())
    }

    fn load_inner(&self, path: &Path, ds: Dataset, _user_input_requester: &dyn UserInputRequester) -> Result<Box<InMemoryDao>> {
        load_sqlite(path, ds)
    }
}

type Users = HashMap<Uuid, User>;

fn load_sqlite(path: &Path, ds: Dataset) -> Result<Box<InMemoryDao>> {
    let file_name = path_file_name(path)?;
    let is_encrypted = file_name == ENCRYPTED_DB_FILENAME;

    let attachments_paths = vec![
        path.with_file_name(ATTACHMENTS_DIR_NAME),
        path.parent().unwrap().with_file_name(ATTACHMENTS_DIR_NAME)
    ];

    let attachments_path =
        attachments_paths.iter().find(|p| p.is_dir()).map(|p| p.as_path());

    if attachments_path.is_none() {
        log::warn!("Attachments directory not found, attachments will not be loaded!");
    }

    let attachments_decrypt_path = attachments_path.map(|p| p.with_file_name(DECRYPTED_ATTACHMENTS_DIR_NAME));
    let attachments_decrypt_path = attachments_decrypt_path.as_ref().map(|p| p.as_path());

    if is_encrypted {
        // TODO: encrypted DBs
        bail!("Encrypted Signal databases are not supported yet, decrypt it first!")
    }

    let conn = Connection::open(path)?;

    let users = parse_users(&conn, &ds.uuid)?;
    let myself_id = get_myself(&conn)?;
    let cwms = parse_cwms(&conn, &ds.uuid, &users, myself_id, attachments_path, attachments_decrypt_path)?;

    let mut users = users.into_values().collect_vec();
    users.sort_by_key(|u| if u.id == *myself_id { *UserId::MIN } else { u.id });

    // If attachments path is not found, DS root doesn't really matter
    let ds_root = attachments_decrypt_path.unwrap_or(path).parent().unwrap().to_path_buf();

    Ok(Box::new(InMemoryDao::new_single(
        format!("{NAME} ({file_name})"),
        ds,
        ds_root,
        myself_id,
        users,
        cwms,
    )))
}

fn parse_users(conn: &Connection, ds_uuid: &PbUuid) -> Result<Users> {
    let mut users = Users::new();

    let mut stmt = conn.prepare(r"SELECT * FROM conversations")?;
    let mut rows = stmt.query([])?;

    while let Some(row) = rows.next()? {
        let uuid = row.get::<_, String>("serviceId")?;
        let uuid = Uuid::parse_str(&uuid)?;
        let id = UserId(uuid_to_i64_pos(uuid)?);

        let first_name_option = row.get::<_, Option<String>>("profileName")?;
        let last_name_option = row.get::<_, Option<String>>("profileFamilyName")?;
        let phone_number_option = row.get::<_, Option<String>>("e164")?;

        let user = User {
            ds_uuid: ds_uuid.clone(),
            id: *id,
            first_name_option,
            last_name_option,
            username_option: None,
            phone_number_option,
            profile_pictures: vec![],
        };

        // TODO: group chats
        let tpe = row.get::<_, String>("type")?;
        ensure!(tpe == "private", "Only 1-to-1 chats are supported, {} is {tpe}", user.pretty_name());

        assert_eq!(users.insert(uuid, user), None, "Duplicate user UUID: {uuid}");
    }

    assert_eq!(users.values().map(|u| u.id).unique().count(), users.len(), "Duplicate user IDs");
    Ok(users)
}

fn parse_cwms(conn: &Connection,
              ds_uuid: &PbUuid,
              users: &Users,
              myself_id: UserId,
              attachments_path: Option<&Path>,
              attachments_decrypt_path: Option<&Path>) -> Result<Vec<ChatWithMessages>> {
    let mut cwms = vec![];

    // NOTE: Non-private conversation types (group chats?) are not supported, and it's checked in `parse_users`
    let mut conv_stmt = conn.prepare(r"SELECT * FROM conversations WHERE type = 'private'")?;
    let mut msg_stmt = conn.prepare(r"SELECT * FROM messages WHERE conversationId = ? ORDER BY sent_at ASC, rowid asc")?;
    let mut calls_stmt = conn.prepare(r"SELECT * FROM callsHistory WHERE callId = ?")?;

    let mut conv_rows = conv_stmt.query([])?;
    while let Some(row) = conv_rows.next()? {
        let chat_uuid_string = row.get::<_, String>("id")?;
        let chat_uuid = Uuid::parse_str(&chat_uuid_string)?;
        let chat_id = ChatId(uuid_to_i64_pos(chat_uuid)?);

        let user_uuid = row.get::<_, String>("serviceId")?;
        let user_uuid = Uuid::parse_str(&user_uuid)?;
        let user = users.get(&user_uuid).ok_or_else(|| anyhow!("Unknown user"))?;
        let member_ids = if user.id == *myself_id {
            vec![*myself_id]
        } else {
            vec![*myself_id, user.id]
        };

        let mut messages: Vec<Message> = vec![];

        let mut msg_rows = msg_stmt.query([chat_uuid_string])?;

        // TODO: rich text
        // TODO: forwards

        while let Some(row) = msg_rows.next()? {
            let source_uuid = row.get::<_, String>("id")?;
            let source_uuid = Uuid::parse_str(&source_uuid)?;
            let source_id = uuid_to_i64_pos(source_uuid)?;

            let direction = row.get::<_, String>("type")?;

            let mut service_option = None;

            let mut text = if let Some(text) = row.get::<_, Option<String>>("body")? {
                vec![RichText::make_plain(text)]
            } else {
                vec![]
            };

            // Parsing JSON unconditionally is expensive but there's no way to get e.g. reply-to message ID without it
            let json = row.get::<_, String>("json")?;
            let mut json = json.into_bytes();
            let json = simd_json::to_borrowed_value(&mut json)?;
            let json = as_object!(json, "json");

            let from_id = match direction.as_str() {
                "incoming" => user.id(),
                "outgoing" => myself_id,
                "call-history" => {
                    let call_id = row.get::<_, String>("callId")?;
                    let mut call_row = calls_stmt.query([call_id])?;
                    let call_row = call_row.next()?.ok_or_else(|| anyhow!("Call not found"))?;
                    let call_direction = call_row.get::<_, String>("direction")?;
                    let from_id = match call_direction.as_str() {
                        "Incoming" => user.id(),
                        "Outgoing" => myself_id,
                        _ => bail!("Unknown call direction: {call_direction}"),
                    };

                    let discard_reason = call_row.get::<_, String>("status")?;
                    let discard_reason = match discard_reason.as_str() {
                        "Accepted" => "hangup",
                        "Declined" => "declined",
                        "Missed" => "missed",
                        _ => bail!("Unknown call discard reason: {discard_reason}"),
                    };

                    service_option = Some(message_service!(ServiceSvo::PhoneCall(MessageServicePhoneCall {
                        duration_sec_option: None, // Duration is not recorded
                        discard_reason_option: Some(discard_reason.to_owned()),
                        members: vec![]
                    })));

                    from_id
                }
                "profile-change" => {
                    const PROFILE_CHANGE_KEY: &str = "profileChange";
                    let profile_change = get_field_object!(json, "<root>", PROFILE_CHANGE_KEY);
                    let change_type = get_field_str!(profile_change, PROFILE_CHANGE_KEY, "type");
                    ensure!(change_type == "name", "Unknown profile change type: {change_type}");

                    let old_name = get_field_str!(profile_change, PROFILE_CHANGE_KEY, "oldName");
                    let new_name = get_field_str!(profile_change, PROFILE_CHANGE_KEY, "newName");

                    text = vec!(RichText::make_plain(format!("{old_name} changed name to {new_name}")));
                    service_option = Some(message_service!(ServiceSvo::Notice(MessageServiceNotice {})));

                    user.id()
                }
                "keychange" => continue, // Not interesting, also not shown in Signal client
                "verified-change" => continue, // Not interesting
                _ => bail!("Unknown message direction: {direction}"),
            };

            // Note: This is timestamp in millis, not in seconds! This is needed to resolve replies, and is
            // divided by 1000 further down.
            let timestamp_ms = get_field_i64!(json, "<root>", "timestamp");

            let is_deleted = row.get::<_, i32>("isErased")? == 1;

            let typed = if let Some(service) = service_option {
                service
            } else {
                const EDIT_TIMESTAMP_KEY: &str = "editMessageTimestamp";
                let edit_timestamp_option =
                    if let Some(edit_timestamp) = json.get(EDIT_TIMESTAMP_KEY) {
                        // We do not track message change history, we're only interested in last edit timestamp
                        let edit_timestamp = as_i64!(edit_timestamp, EDIT_TIMESTAMP_KEY);
                        Some(edit_timestamp / 1000)
                    } else { None };

                const QUOTE_KEY: &str = "quote";
                let reply_to_message_id_option =
                    if let Some(quote) = json.get(QUOTE_KEY) {
                        let quote = as_object!(quote, QUOTE_KEY);

                        // No idea why timestamp is stored in "id" field
                        let reply_to_timestamp = get_field_i64!(quote, QUOTE_KEY, "id");

                        let reply_to = messages.iter().rev()
                            .take_while(|m| m.timestamp >= reply_to_timestamp)
                            .find(|m| m.timestamp == reply_to_timestamp);

                        reply_to.and_then(|m| m.source_id_option)
                    } else { None };

                const ATTACHMENTS_KEY: &str = "attachments";
                let attachments =
                    if attachments_path.is_none() {
                        vec![]
                    } else if let Some(attachments) = json.get(ATTACHMENTS_KEY) {
                        parse_attachments(as_array!(attachments, ATTACHMENTS_KEY))?
                    } else {
                        vec![]
                    };

                let mut contents = vec![];
                for attachment in attachments {
                    let c = decrypt_attachment(attachment, attachments_path.unwrap(), attachments_decrypt_path.unwrap())?;
                    contents.push(c);
                }

                message_regular! {
                    edit_timestamp_option,
                    is_deleted,
                    forward_from_name_option: None,
                    reply_to_message_id_option,
                    contents,
                }
            };

            messages.push(Message::new(
                *NO_INTERNAL_ID, // Will be set later
                Some(source_id),
                timestamp_ms, // Will be corrected later
                from_id,
                text,
                typed,
            ));
        }

        if !messages.is_empty() {
            messages.iter_mut().enumerate().for_each(|(i, m)| {
                m.internal_id = i as i64;
                m.timestamp = m.timestamp / 1000;
            });

            cwms.push(ChatWithMessages {
                chat: Chat {
                    ds_uuid: ds_uuid.clone(),
                    id: *chat_id,
                    name_option: user.first_name_option.clone(),
                    source_type: SourceType::Signal as i32,
                    tpe: ChatType::Personal as i32,
                    img_path_option: None,
                    member_ids,
                    msg_count: messages.len() as i32,
                    main_chat_id: None,
                },
                messages,
            });
        }
    }

    Ok(cwms)
}

fn decrypt_attachment(a: LinkedAttachment, src_path: &Path, dst_path: &Path) -> Result<Content> {
    let path_option = decrypt_linked_file(a.name.as_deref(), &a.file_info, src_path, dst_path)?;
    let file_name_option = a.name;
    let mime_type = a.file_info.mime_type;
    let result = if mime_type.starts_with("image/") {
        content!(Photo {
            path_option,
            width: a.file_info.width.unwrap_or(0),
            height: a.file_info.height.unwrap_or(0),
            mime_type_option: Some(mime_type),
            is_one_time: false,
        })
    } else if mime_type.starts_with("video/") {
        let thumbnail_path_option =
            if let Some(screenshot) = a.screenshot {
                decrypt_linked_file(Some("screenshot"), &screenshot, src_path, dst_path)?
            } else if let Some(thumbnail) = a.thumbnail {
                decrypt_linked_file(Some("thumbnail"), &thumbnail, src_path, dst_path)?
            } else { None };

        content!(Video {
            path_option,
            file_name_option,
            title_option: None,
            performer_option: None,
            width: a.file_info.width.unwrap_or(0),
            height: a.file_info.height.unwrap_or(0),
            mime_type,
            duration_sec_option: None,
            thumbnail_path_option,
            is_one_time: false,
        })
    } else if mime_type.starts_with("audio/") {
        content!(VoiceMsg {
            path_option,
            file_name_option,
            mime_type,
            duration_sec_option: None,
        })
    } else {
        bail!("Unsupported attachment MIME type: {mime_type}")
    };
    Ok(result)
}

/// Returns relative path to decrypted file
fn decrypt_linked_file(name: Option<&str>,
                       file_info: &LinkedFileInfo,
                       src_path: &Path,
                       dst_path: &Path) -> Result<Option<String>> {
    if let Some(path) = file_info.path.as_deref() {
        let full_src_path = src_path.join(path);
        if !full_src_path.exists() {
            log::warn!("Attachment not found: {} ({})", name.unwrap_or(UNNAMED), full_src_path.display());
            return Ok(None);
        }
        if !dst_path.is_dir() {
            fs::create_dir(dst_path)?;
        }

        let full_dst_path = dst_path.join(path);
        if !full_dst_path.exists() {
            log::info!("Decrypting {path}");

            use cipher::*;
            // Data will be decrypted in-place
            let mut enc_data = fs::read(full_src_path)?;
            ensure!(enc_data.len() >= AES_BLOCK_SIZE + SHA256_SIZE, "Attachment data too short");

            let key = file_info.local_key.as_deref().ok_or_else(|| anyhow!("Attachment key not found!"))?;
            let key = BASE64_STANDARD.decode(key)?;
            ensure!(key.len() == CIPHER_KEY_SIZE + MAC_KEY_SIZE, "Invalid key length");

            let cipher_key = &key[..CIPHER_KEY_SIZE];
            let mac_key = &key[CIPHER_KEY_SIZE..];

            let enc_data_len = enc_data.len();
            let iv = enc_data[..AES_BLOCK_SIZE].to_vec();
            let their_mac = enc_data[enc_data_len - SHA256_SIZE..].to_vec();
            let data = &mut enc_data[AES_BLOCK_SIZE..(enc_data_len - SHA256_SIZE)];
            ensure!(data.len() % AES_BLOCK_SIZE == 0, "Invalid attachment data length");

            let our_mac = {
                let mut hmac = HmacSha256::new_from_slice(mac_key).expect("HMAC can take key of any size");
                hmac.update(&iv);
                hmac.update(data);
                hmac.finalize()
            };
            let our_mac = our_mac.into_bytes();
            let our_mac = our_mac.as_slice();
            ensure!(our_mac == &their_mac, "Attachment MAC mismatch");

            let mut dec = Aes256CbcDecryptor::new_from_slices(cipher_key, &iv)
                .map_err(|_| anyhow!("Invalid attachment key/IV length"))?;

            for data in data.chunks_mut(AES_BLOCK_SIZE) {
                dec.decrypt_block_mut(Aes256CbcBlock::from_mut_slice(data));
            }

            fs::create_dir_all(full_dst_path.parent().unwrap())?;
            fs::write(full_dst_path, data)?;
        } else {
            // No cheap way to compare files, so we just assume they're the same
        }


        Ok(Some(format!("{}/{path}", path_file_name(dst_path)?)))
    } else {
        Ok(None)
    }
}

const ATTACHMENT_KEY: &str = "attachment";

fn parse_attachments(jsons: &[Value]) -> Result<Vec<LinkedAttachment>> {
    let mut attachments = vec![];

    for json in jsons {
        let json = as_object!(json, ATTACHMENT_KEY);
        let attachment = parse_attachment(json)?;
        attachments.push(attachment);
    }

    Ok(attachments)
}

fn parse_attachment(json: &Object) -> Result<LinkedAttachment> {
    let name =
        if let Some(name) = json.get("fileName") { as_string_option!(name, "fileName") } else { None };
    let file_info = parse_linked_file_info(json, ATTACHMENT_KEY)?;
    let thumbnail = if let Some(thumbnail) = json.get("thumbnail") {
        Some(parse_linked_file_info(as_object!(thumbnail, ATTACHMENT_KEY),
                                    &format!("{ATTACHMENT_KEY}.thumbnail"))?)
    } else { None };
    let screenshot = if let Some(screenshot) = json.get("screenshot") {
        Some(parse_linked_file_info(as_object!(screenshot, ATTACHMENT_KEY),
                                    &format!("{ATTACHMENT_KEY}.screenshot"))?)
    } else { None };
    Ok(LinkedAttachment { name, file_info, thumbnail, screenshot })
}

fn parse_linked_file_info(json: &Object, key: &str) -> Result<LinkedFileInfo> {
    let mime_type = get_field_string!(json, key, "contentType");
    let version = json.get("version").and_then(|v| v.as_i32());
    let path = json.get("path").and_then(|v| v.as_str()).map(|v| v.to_owned());
    let size = get_field_i64!(json, key, "size") as usize;
    let local_key = json.get("localKey").and_then(|v| v.as_str()).map(|v| v.to_owned());
    let width = json.get("width").and_then(|v| v.as_i32());
    let height = json.get("height").and_then(|v| v.as_i32());
    Ok(LinkedFileInfo { _version: version, mime_type, path, _size: size, local_key, width, height })
}

fn get_myself(conn: &Connection) -> Result<UserId> {
    let mut stmt = conn.prepare(r"SELECT * FROM items WHERE id = 'uuid_id'")?;
    let mut rows = stmt.query([])?;

    let mut json_vec: Vec<String> = vec![];
    while let Some(row) = rows.next()? {
        let json = row.get::<_, String>("json")?;
        json_vec.push(json)
    }
    ensure!(json_vec.len() == 1, "Expected exactly one uuid_id entry");

    const PATTERN: &str = r#""value":"#;

    let json = json_vec.first().unwrap().as_str();
    let idx = json.find(PATTERN).ok_or(anyhow!("Malformed uuid_id JSON!"))?;
    let idx = idx + PATTERN.len() + 1;
    let uuid = &json[idx..idx + 36];
    let uuid = Uuid::parse_str(uuid).map_err(|_| anyhow!("Malformed uuid_id JSON!"))?;
    let id = UserId(uuid_to_i64_pos(uuid)?);
    return Ok(id);
}

fn uuid_to_i64_pos(uuid: Uuid) -> Result<i64> {
    let uuid_bytes = uuid.as_bytes();
    let uuid_parts: Vec<[u8; 8]> = vec![
        uuid_bytes[0..8].try_into()?,
        uuid_bytes[8..16].try_into()?
    ];
    let uuid_parts = uuid_parts.iter().map(|bs| u64::from_le_bytes(*bs)).collect_vec();
    let res_u64 = uuid_parts.iter().cloned().reduce(|a, b| a.wrapping_add(b)).unwrap();
    Ok((res_u64 / 2) as i64)
}

struct LinkedAttachment {
    name: Option<String>,

    file_info: LinkedFileInfo,

    thumbnail: Option<LinkedFileInfo>,
    screenshot: Option<LinkedFileInfo>,
}

struct LinkedFileInfo {
    _version: Option<i32>,
    mime_type: String,
    path: Option<String>,
    _size: usize,
    local_key: Option<String>,

    width: Option<i32>,
    height: Option<i32>,
}

mod cipher {
    use aes::cipher::Block;
    use aes::Aes256;
    use cbc::Decryptor;
    use hmac::Hmac;
    use sha2::Sha256;

    pub const CIPHER_KEY_SIZE: usize = 32;
    pub const MAC_KEY_SIZE: usize = 32;

    pub const AES_BLOCK_SIZE: usize = 16;
    pub const SHA256_SIZE: usize = 32;

    pub type HmacSha256 = Hmac<Sha256>;

    pub type Aes256CbcDecryptor = Decryptor<Aes256>;
    pub type Aes256CbcBlock = Block<Aes256CbcDecryptor>;
}
