use super::DataLoader;
use crate::prelude::client::MyselfChooser;
use crate::prelude::*;
use chat_history_manager_core::protobuf::history::Dataset;
use itertools::Itertools;

use content::SealedValueOptional as ContentSvo;
use message_service::SealedValueOptional as ServiceSvo;

use rusqlite::Connection;
use simd_json::prelude::ArrayTrait;
use std::path::Path;
use uuid::Uuid;

pub struct SignalDataLoader;

const NAME: &'static str = "Signal";

const ENCRYPTED_DB_FILENAME: &'static str = "db.sqlite";
const PLAINTEXT_DB_FILENAME: &'static str = "plaintext.sqlite";

impl DataLoader for SignalDataLoader {
    fn name(&self) -> String { NAME.to_owned() }

    fn looks_about_right_inner(&self, path: &Path) -> EmptyRes {
        let file_name = path_file_name(path)?;
        if file_name != ENCRYPTED_DB_FILENAME && file_name != PLAINTEXT_DB_FILENAME {
            bail!("File is not {ENCRYPTED_DB_FILENAME} nor {PLAINTEXT_DB_FILENAME}")
        }
        Ok(())
    }

    fn load_inner(&self, path: &Path, ds: Dataset, _myself_chooser: &dyn MyselfChooser) -> Result<Box<InMemoryDao>> {
        load_sqlite(path, ds)
    }
}

type Users = HashMap<Uuid, User>;

fn load_sqlite(path: &Path, ds: Dataset) -> Result<Box<InMemoryDao>> {
    let file_name = path_file_name(path)?;
    let is_encrypted = file_name == ENCRYPTED_DB_FILENAME;

    if is_encrypted {
        // TODO: encrypted DBs
        bail!("Encrypted Signal databases are not supported yet, decrypt it first!")
    }

    let conn = Connection::open(path)?;

    let users = parse_users(&conn, &ds.uuid)?;
    let myself_id = get_myself(&conn)?;
    let cwms = parse_cwms(&conn, &ds.uuid, &users, myself_id)?;

    let mut users = users.into_values().collect_vec();
    users.sort_by_key(|u| if u.id == *myself_id { *UserId::MIN } else { u.id });

    Ok(Box::new(InMemoryDao::new_single(
        format!("{NAME} ({file_name})"),
        ds,
        path.to_path_buf(),
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
        let id = UserId(uuid_to_u32(uuid)? as i64);

        let first_name_option = row.get::<_, Option<String>>("profileName")?;
        let last_name_option = row.get::<_, Option<String>>("profileFamilyName")?;
        let phone_number_option = row.get::<_, Option<String>>("e164")?;

        users.insert(uuid, User {
            ds_uuid: ds_uuid.clone(),
            id: *id,
            first_name_option,
            last_name_option,
            username_option: None,
            phone_number_option,
            profile_pictures: vec![],
        });
    }

    Ok(users)
}

fn parse_cwms(conn: &Connection, ds_uuid: &PbUuid, users: &Users, myself_id: UserId) -> Result<Vec<ChatWithMessages>> {
    let mut cwms = vec![];

    // TODO: group chats
    // TODO: attachments
    let mut conv_stmt = conn.prepare(r"SELECT * FROM conversations WHERE type = 'private'")?;
    let mut conv_rows = conv_stmt.query([])?;

    let mut msg_stmt = conn.prepare(r"SELECT * FROM messages WHERE conversationId = ? ORDER BY sent_at ASC, rowid asc")?;

    let mut calls_stmt = conn.prepare(r"SELECT * FROM callsHistory WHERE callId = ?")?;

    while let Some(row) = conv_rows.next()? {
        let chat_uuid_string = row.get::<_, String>("id")?;
        let chat_uuid = Uuid::parse_str(&chat_uuid_string)?;
        let chat_id = ChatId(uuid_to_u32(chat_uuid)? as i64);

        let user_uuid = row.get::<_, String>("serviceId")?;
        let user_uuid = Uuid::parse_str(&user_uuid)?;
        let user = users.get(&user_uuid).ok_or_else(|| anyhow!("Unknown user"))?;
        let member_ids = if user.id == *myself_id {
            vec![*myself_id]
        } else {
            vec![*myself_id, user.id]
        };

        let mut messages = vec![];

        let mut msg_rows = msg_stmt.query([chat_uuid_string])?;

        // TODO: content
        // TODO: rich text
        // TODO: edit
        // TODO: reply to

        while let Some(row) = msg_rows.next()? {
            let source_uuid = row.get::<_, String>("id")?;
            let source_uuid = Uuid::parse_str(&source_uuid)?;
            let source_id = uuid_to_u32(source_uuid)? as i64;

            let direction = row.get::<_, String>("type")?;

            let mut service_option = None;
            let mut content_option = None;

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
                "keychange" => continue, // Not interesting, also not shown in Signal client
                "profile-change" => continue, // TODO: Profile was renamed
                "verified-change" => continue, // Not interesting
                _ => bail!("Unknown message direction: {direction}"),
            };

            let timestamp = row.get::<_, i64>("sent_at")?;
            let timestamp = timestamp / 1000;

            let is_deleted = row.get::<_, i32>("isErased")? == 1;

            let text_option = row.get::<_, Option<String>>("body")?;
            let text = if let Some(text) = text_option {
                vec![RichText::make_plain(text)]
            } else {
                vec![]
            };

            let typed = service_option.unwrap_or_else(|| {
                message_regular! {
                    edit_timestamp_option: None,
                    is_deleted,
                    forward_from_name_option: None,
                    reply_to_message_id_option: None,
                    content_option,
                }
            });

            messages.push(Message::new(
                *NO_INTERNAL_ID,
                Some(source_id),
                timestamp,
                from_id,
                text,
                typed,
            ));
        }

        if !messages.is_empty() {
            messages.iter_mut().enumerate().for_each(|(i, m)| m.internal_id = i as i64);

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
    let id = UserId(uuid_to_u32(uuid)? as i64);
    return Ok(id);
}

fn uuid_to_u32(uuid: Uuid) -> Result<u32> {
    let uuid_bytes = uuid.as_bytes();
    let uuid_parts: Vec<[u8; 4]> = vec![
        uuid_bytes[0..4].try_into()?,
        uuid_bytes[4..8].try_into()?,
        uuid_bytes[8..12].try_into()?,
        uuid_bytes[12..16].try_into()?
    ];
    let uuid_parts = uuid_parts.iter().map(|bs| u32::from_le_bytes(*bs)).collect_vec();
    Ok(uuid_parts.iter().cloned().reduce(|a, b| a.wrapping_add(b)).unwrap())
}
