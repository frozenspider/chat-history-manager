use std::fs;

use rusqlite::Connection;

use super::*;
use super::android::*;

#[cfg(test)]
#[path = "tinder_android_tests.rs"]
mod tests;

pub struct TinderAndroidDataLoader<'a, H: HttpClient> {
    pub http_client: &'a H,
}

/// Using a first legal ID (i.e. "1") for myself
const MYSELF_ID: UserId = UserId(UserId::INVALID.0 + 1);

/// Technically, self does have a proper key, but knowing it doesn't help us.
const MYSELF_KEY: &str = "myself";

const NAME: &str = "Tinder";
pub const DB_FILENAME: &str = "tinder-3.db";

type UserKey = String;
type Users = HashMap<UserKey, User>;

impl<H: HttpClient> AndroidDataLoader for TinderAndroidDataLoader<'_, H> {
    const NAME: &'static str = NAME;
    const DB_FILENAME: &'static str = DB_FILENAME;

    type Users = Users;

    fn tweak_conn(&self, _path: &Path, _conn: &Connection) -> EmptyRes { Ok(()) }

    fn normalize_users(&self, users: Users, _cwms: &[ChatWithMessages]) -> Result<Vec<User>> {
        let mut users = users.into_values().collect_vec();
        // Set myself to be a first member.
        users.sort_by_key(|u| if u.id == *MYSELF_ID { *UserId::MIN } else { u.id });
        Ok(users)
    }

    fn parse_users(&self, conn: &Connection, ds_uuid: &PbUuid, path: &Path) -> Result<Users> {
        let mut users: Users = Default::default();

        users.insert(MYSELF_KEY.to_owned(), User {
            ds_uuid: ds_uuid.clone(),
            id: *MYSELF_ID,
            first_name_option: Some("Me".to_owned()), // No way to know your own name, sadly
            last_name_option: None,
            username_option: None,
            phone_number_option: None,
            profile_pictures: vec![],
        });

        let downloaded_media_path = path.join(RELATIVE_MEDIA_DIR);
        fs::create_dir_all(&downloaded_media_path)?;

        let mut stmt = conn.prepare(r"SELECT * FROM match_person")?;
        let mut rows = stmt.query([])?;

        while let Some(row) = rows.next()? {
            let key = row.get::<_, String>("id")?;
            let id = UserId(hash_to_id(&key));

            let name_option = row.get::<_, Option<String>>("name")?;

            let photos_blob = row.get::<_, Vec<u8>>("photos")?;
            let photo_urls = analyze_photos_blob(&key, photos_blob)?;
            let mut profile_pictures = vec![];
            for photo_url in photo_urls {
                let (_, file_name) = photo_url.rsplit_once("/").unwrap();
                // TODO: This can be downloaded in parallel, but slow running time isn't a big deal.
                download_if_missing(file_name, &downloaded_media_path, &photo_url, self.http_client)?;
                profile_pictures.push(ProfilePicture {
                    path: format!("{RELATIVE_MEDIA_DIR}/{file_name}"),
                    frame_option: None,
                });
            }

            users.insert(key, User {
                ds_uuid: ds_uuid.clone(),
                id: *id,
                first_name_option: name_option,
                last_name_option: None,
                username_option: None,
                phone_number_option: None,
                profile_pictures,
            });
        }

        Ok(users)
    }

    fn parse_chats(&self, conn: &Connection, ds_uuid: &PbUuid, path: &Path, users: &mut Users) -> Result<Vec<ChatWithMessages>> {
        let mut cwms = vec![];

        let downloaded_media_path = path.join(RELATIVE_MEDIA_DIR);
        fs::create_dir_all(&downloaded_media_path)?;

        let mut stmt = conn.prepare(r"
            SELECT *
            FROM message
            WHERE match_id LIKE '%' || ? || '%'
            ORDER BY sent_date ASC
        ")?;

        for (key, user) in users {
            if key == MYSELF_KEY { continue; }

            let mut rows = stmt.query([key])?;

            let mut messages = vec![];
            while let Some(row) = rows.next()? {
                // Source ID is way too large to fit into i64, so we use hash instead.
                let source_id = row.get::<_, String>("id")?;
                let source_id = hash_to_id(&source_id);

                let timestamp = row.get::<_, i64>("sent_date")? / 1000;

                let from_id = if &row.get::<_, String>("from_id")? == key { user.id() } else { MYSELF_ID };

                let text = row.get::<_, String>("text")?;
                let (text, contents) = if text.starts_with("https://media.tenor.com/") {
                    // This is a GIF, let's download it and include it as a sticker.
                    // Example: https://media.tenor.com/mYFQztB4EHoAAAAM/house-hugh-laurie.gif?width=220&height=226
                    let hash = hash_to_id(&text);
                    let file_name = format!("{}.gif", hash);
                    download_if_missing(&file_name, &downloaded_media_path, &text, self.http_client)?;
                    let (width, height) = {
                        let split = text.split(['?', '&']).skip(1).collect_vec();
                        (split.iter().find(|s| s.starts_with("width=")).map(|s| s[6..].parse()).unwrap_or(Ok(0))?,
                         split.iter().find(|s| s.starts_with("height=")).map(|s| s[7..].parse()).unwrap_or(Ok(0))?)
                    };
                    (vec![], vec![
                        content!(Sticker {
                            path_option: Some(format!("{RELATIVE_MEDIA_DIR}/{file_name}")),
                            file_name_option: Some(file_name),
                            width: width * 2,
                            height: height * 2,
                            mime_type_option: None,
                            thumbnail_path_option: None,
                            emoji_option: None,
                        })
                    ])
                } else {
                    (vec![RichText::make_plain(text)], vec![])
                };

                let text = normalize_rich_text(text);

                messages.push(Message::new(
                    *NO_INTERNAL_ID,
                    Some(source_id),
                    timestamp,
                    from_id,
                    text,
                    message_regular! {
                        edit_timestamp_option: None,
                        is_deleted: false,
                        forward_from_name_option: None,
                        reply_to_message_id_option: None,
                        contents,
                    },
                ));
            }
            messages.iter_mut().enumerate().for_each(|(i, m)| m.internal_id = i as i64);

            cwms.push(ChatWithMessages {
                chat: Chat {
                    ds_uuid: ds_uuid.clone(),
                    id: user.id,
                    name_option: user.first_name_option.clone(),
                    source_type: SourceType::TinderDb as i32,
                    tpe: ChatType::Personal as i32,
                    img_path_option: None,
                    member_ids: vec![*MYSELF_ID, user.id],
                    msg_count: messages.len() as i32,
                    main_chat_id: None,
                },
                messages,
            });
        }

        Ok(cwms)
    }
}

fn analyze_photos_blob(user_key: &UserKey, bytes: Vec<u8>) -> Result<Vec<String>> {
    use crate::utils::blob_utils::*;

    let mut photos = vec![];

    fn analyze_photos_blob_recursive(user_key: &UserKey, bytes: &[u8], photos: &mut Vec<String>) -> EmptyRes {
        let ([first_byte], bytes) = next_const_n_bytes::<1>(bytes);
        let bytes = match first_byte {
            0x0A => {
                let ([_, _, tpe], bytes) = next_const_n_bytes::<3>(bytes);
                match tpe {
                    0x00 => {
                        // No more data
                        return Ok(());
                    }
                    0x0A => { /* Continue  processing */ }
                    etc => {
                        bail!("Unexpected Tinder photos BLOB format for user {user_key}, unknown type 0x{:02X}", etc)
                    }
                }

                let ([url_len], bytes) = next_const_n_bytes::<1>(bytes);
                let (url, mut bytes) = next_n_bytes(bytes, url_len as usize);
                let url = String::from_utf8(url.into())?;
                photos.push(url);

                // Skipping lower quality photos
                while !bytes.is_empty() && bytes[0] == 0x12 {
                    let mut b: u8 = 0x00;
                    while b != 0x1A {
                        ([b], bytes) = next_const_n_bytes::<1>(bytes);
                    }
                    bytes = {
                        let ([url_len], bytes) = next_const_n_bytes::<1>(bytes);
                        let (_url, bytes) = next_n_bytes(bytes, url_len as usize);
                        bytes
                    };
                }


                let ([separator], bytes) = next_const_n_bytes::<1>(bytes);
                ensure!(separator == 0x1A, "Unexpected Tinder photos BLOB format for user {user_key}");

                let ([uuid_len], bytes) = next_const_n_bytes::<1>(bytes);
                let (_uuid, bytes) = next_n_bytes(bytes, uuid_len as usize);

                let ([next_block_type], bytes) = next_const_n_bytes::<1>(bytes);
                match next_block_type {
                    0x30 => {
                        // Final block to discard
                        let ([_, _, block_len], bytes) = next_const_n_bytes::<3>(bytes);
                        let (_skip, bytes) = next_n_bytes(bytes, block_len as usize);
                        bytes
                    }
                    0x22 => {
                        // Videos
                        let (_skip, mut bytes) = next_n_bytes(bytes, 7);
                        // Skipping all of them
                        let mut section: u8;
                        loop {
                            bytes = {
                                let ([separator], bytes) = next_const_n_bytes::<1>(bytes);
                                ensure!(separator == 0x1A, "Unexpected Tinder photos BLOB format for user {user_key} (video)");
                                let ([url_len], bytes) = next_const_n_bytes::<1>(bytes);
                                let (_url, bytes) = next_n_bytes(bytes, url_len as usize);
                                let url = String::from_utf8(_url.into())?;
                                log::debug!("Skipping video URL {url}");

                                let (_skip, bytes) = next_n_bytes(bytes, 3);
                                let ([section_inner], bytes) = next_const_n_bytes::<1>(bytes);
                                section = section_inner;

                                bytes
                            };
                            if section == 0x22 {
                                (_, bytes) = next_n_bytes(bytes, 7);
                            } else { break; }
                        }
                        ensure!(section == 0x30, "Unexpected Tinder photos BLOB format for user {user_key} (video), unknown section 0x{:02X}", section);

                        let (_skip, bytes) = next_n_bytes(bytes, 3);
                        bytes
                    }
                    etc => {
                        bail!("Unexpected Tinder photos BLOB format for user {user_key}, unknown section 0x{:02X}", etc)
                    }
                }
            }
            0x52 => {
                let ([uuid_len], bytes) = next_const_n_bytes::<1>(bytes);
                let (_uuid, bytes) = next_n_bytes(bytes, uuid_len as usize);
                bytes
            }
            0x42 => {
                // No idea what this block is
                let ([len], bytes) = next_const_n_bytes::<1>(bytes);
                let (_skip, bytes) = next_n_bytes(bytes, len as usize);
                bytes
            }
            etc => {
                bail!("Unexpected Tinder photos BLOB format for user {user_key}: don't know how to handle section 0x{:02X}", etc)
            }
        };

        if bytes.is_empty() {
            Ok(())
        } else {
            analyze_photos_blob_recursive(user_key, bytes, photos)
        }
    }

    if !bytes.is_empty() {
        analyze_photos_blob_recursive(user_key, &bytes, &mut photos)?;
    }

    Ok(photos)
}

fn download_if_missing(file_name: &str, storage_path: &Path, url: &str, http_client: &impl HttpClient) -> EmptyRes {
    let file_path = storage_path.join(file_name);
    if !file_path.exists() {
        log::info!("Downloading {}", url);
        match http_client.get_bytes(url) {
            Ok(HttpResponse::Ok(body)) => {
                fs::write(&file_path, body)?
            }
            Ok(HttpResponse::Failure { status, .. }) =>
                log::warn!("Failed to download {file_name}: HTTP code {}", status.as_str()),
            Err(e) =>
                log::warn!("Failed to download {file_name}: {}", e),
        }
    }
    Ok(())
}
