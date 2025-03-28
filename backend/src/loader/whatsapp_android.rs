use std::collections::hash_map::Entry;

use ical::VcardParser;
use lazy_static::lazy_static;
use num_traits::FromPrimitive;
use regex::Regex;
use rusqlite::{Connection, OptionalExtension, Row, Statement};
use super::*;
use super::android::AndroidDataLoader;

#[cfg(test)]
#[path = "whatsapp_android_tests.rs"]
mod tests;

lazy_static! {
    static ref PHONE_JID_REGEX: Regex = Regex::new(r"^([\d]{5,})@s.whatsapp.net$").unwrap();
}

/// Some notes about the implementation:
/// 1. msgstore.db and wa.db file should lie in either in the data root folder, or in ./databases subfolder
/// 2. Media is resolved using <data_root>/Media
/// 3. User avatars are looked up in <data_root>/files/Avatars
pub struct WhatsAppAndroidDataLoader;

const NAME: &str = "WhatsApp";
pub const DB_FILENAME: &str = "msgstore.db";

type Jid = String;
type MessageKey = String;

#[derive(Default)]
pub struct Users {
    jids: HashMap<Jid, UserId>,
    id_to_user: HashMap<UserId, User, Hasher>,
    occupied_user_ids: HashSet<UserId, Hasher>,
    myself_id: Option<UserId>,
}

impl Users {
    fn add_or_get_user_id(&mut self, jid: Jid) -> UserId {
        match self.jids.entry(jid) {
            Entry::Occupied(ref occ) =>
                *occ.get(),
            Entry::Vacant(vac) => {
                let user_id = UserId(hash_to_id(vac.key()));
                assert!(!self.occupied_user_ids.contains(&user_id));
                self.occupied_user_ids.insert(user_id);
                *vac.insert(user_id)
            }
        }
    }
}

impl AndroidDataLoader for WhatsAppAndroidDataLoader {
    const NAME: &'static str = NAME;
    const DB_FILENAME: &'static str = DB_FILENAME;

    type Users = Users;

    fn tweak_conn(&self, path: &Path, conn: &Connection) -> EmptyRes {
        conn.execute(r#"ATTACH DATABASE ?1 AS wa_db"#, [path_to_str(&path.join("wa.db"))?])?;
        Ok(())
    }

    fn normalize_users(&self, users: Users, cwms: &[ChatWithMessages]) -> Result<Vec<User>> {
        let myself_id = users.myself_id.unwrap();
        // Filter out users not participating in chats.
        let participating_user_ids: HashSet<i64, Hasher> = cwms.iter()
            .map(|cwm| &cwm.chat)
            .flat_map(|c| &c.member_ids)
            .copied()
            .collect();
        let mut users = users.id_to_user.into_values()
            .filter(|u| u.id == *myself_id || participating_user_ids.contains(&u.id))
            .collect_vec();
        // Set myself to be a first member (not required by convention but to match existing behaviour).
        users.sort_by_key(|u| if u.id == *myself_id { *UserId::MIN } else { u.id });
        Ok(users)
    }

    fn parse_users(&self, conn: &Connection, ds_uuid: &PbUuid, _path: &Path) -> Result<Users> {
        let mut users: Users = Default::default();

        // 1-on-1 chat users
        parse_users_from_stmt(&mut conn.prepare(r"
            SELECT
                jid.raw_string as jid,
                wa_contacts.*
            FROM jid
            LEFT JOIN wa_contacts ON wa_contacts.jid = jid.raw_string
            GROUP BY jid.raw_string
        ")?, ds_uuid, &mut users)?;

        // Group chat users
        parse_users_from_stmt(&mut conn.prepare(r"
            SELECT
                jid.raw_string as jid,
                wa_contacts.*
            FROM message
            LEFT JOIN jid ON jid._id = message.sender_jid_row_id
            LEFT JOIN wa_contacts ON wa_contacts.jid = jid.raw_string
            WHERE message.sender_jid_row_id > 0
            GROUP BY jid.raw_string
        ")?, ds_uuid, &mut users)?;

        // It's not clear how to get own ID from WhatsApp.
        // As such:
        // - Using a first legal ID (i.e. "1") for myself.
        // - Can only discover JID (and populate phone number) when group join message is found.
        //   However, better keep myself as id = 1.
        const MYSELF_ID: UserId = UserId(UserId::INVALID.0 + 1);
        users.myself_id = Some(MYSELF_ID);
        assert!(!users.occupied_user_ids.contains(&MYSELF_ID));

        let my_name = conn.query_row("SELECT value FROM props WHERE key = 'user_push_name'",
                                     [], |r| r.get::<_, Option<String>>(0))
            .optional().map(|o| o.flatten())?.unwrap_or("Me".to_owned());

        users.id_to_user.insert(MYSELF_ID, User {
            ds_uuid: ds_uuid.clone(),
            id: *MYSELF_ID,
            first_name_option: Some(my_name),
            last_name_option: None,
            username_option: None,
            phone_number_option: None,
            profile_pictures: vec![],
        });

        Ok(users)
    }

    fn parse_chats(&self,
                   conn: &Connection,
                   ds_uuid: &PbUuid,
                   _path: &Path,
                   users: &mut Users) -> Result<Vec<ChatWithMessages>> {
        parse_chats(conn, ds_uuid, users)
    }
}

fn parse_users_from_stmt(stmt: &mut Statement, ds_uuid: &PbUuid, users: &mut Users) -> EmptyRes {
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let jid = row.get::<_, String>("jid")?;
        let id: UserId = users.add_or_get_user_id(jid.clone());

        if users.id_to_user.contains_key(&id) {
            continue;
        }

        let sort_name_option = row.get::<_, Option<String>>("sort_name")?;
        let wa_name_option = row.get::<_, Option<String>>("wa_name")?;

        // When phone number is not explicitly supplied, we can deduce it from certain JIDs
        let phone_number_option = row.get::<_, Option<String>>("number")?.or_else(|| {
            PHONE_JID_REGEX.captures(&jid).map(|c| format!("+{}", c.get(1).unwrap().as_str()))
        });

        let username_option = if phone_number_option.is_none() {
            // If phone number is left unknown, we're using JID as a username in order to not lose information
            Some(jid)
        } else {
            row.get::<_, Option<String>>("nickname")?
        };

        let first_name_option = sort_name_option.or(wa_name_option);

        users.id_to_user.insert(id, User {
            ds_uuid: ds_uuid.clone(),
            id: *id,
            first_name_option,
            last_name_option: None, // Last name is unreliable
            username_option,
            phone_number_option,
            profile_pictures: vec![], // TODO
        });
    }
    Ok(())
}

#[repr(i32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, FromPrimitive)]
enum MessageType {
    Text = 0,
    Picture = 1,
    Audio = 2,
    Video = 3,
    ContactVcard = 4,
    StaticLocation = 5,
    /// Corresponds to a large group of actions, distinguished by `message_system.action_type`.
    /// See [SystemActionType].
    System = 7,
    Document = 9,
    MissedCall = 10,
    WaitingForMessage = 11,
    AnimatedGif = 13,
    /// Original message key is preserved in `message_revoked`.
    Deleted = 15,
    LiveLocation = 16,
    AnimatedSticker = 20,
    BusinessItem = 23,
    BusinessItemTemplated = 25,
    OneTimePassword = 27,
    WhatsAppMessage = 28,
    /// Details are in `message_ephemeral_setting`.
    /// (Not sure if that's only "set" or "set or unset")
    DisappearTimerSet = 36,
    OneTimePhoto = 42,
    OneTimeVideo = 43,
    VideoCall = 90,
}

#[repr(i32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, FromPrimitive)]
enum SystemActionType {
    /// Details are in `message_system_photo_change`, but it's not very useful
    GroupPhotoChange = 6,
    /// Details are in `message_system_group`
    GroupCreate = 11,
    /// Details are in `message_system_group` and `message_system_chat_participant`
    GroupUserAdd = 12,
    /// Details are in `message_system_group` and `message_system_chat_participant`
    GroupUserRemove = 14,
    /// Details are in `message_system_number_change`
    PhoneNumberChange = 28,
    /// Details are in `message_system_value_change`
    BecameBusinessAccount = 46,
    BlockContact = 58,
    /// Details are in `message_ephemeral_setting`.
    /// (Not sure if that's only "unset" or "set or unset", looks like an opposite of [MessageType::DisappearTimerSet])
    DisappearTimerDisabled = 59,
    /// Details are in `message_system_initial_privacy_provider`, but no idea what it is
    PrivacyProvider = 67,
    /// Don't know the exact specifics, but it's not interesting anyway
    BusinessState = 69,
    /// No idea what it is
    IsAContact = 129,
}

mod columns {
    pub mod chat {
        pub const SUBJECT: &str = "subject";
    }

    pub mod message {
        pub const TIMESTAMP: &str = "timestamp";
        pub const FROM_ME: &str = "from_me";
        pub const KEY: &str = "key_id";
        pub const TYPE: &str = "message_type";
        pub const TEXT: &str = "text_data";
        pub const RECIPIENT_COUNT: &str = "recipient_count";

        // References
        pub const SENDER_JID_ROW_ID: &str = "sender_jid_row_id";
        pub const CHAT_ROW_ID: &str = "chat_row_id";
    }

    pub mod message_media {
        pub const FILE_PATH: &str = "file_path";
        pub const NAME: &str = "media_name";
        pub const WIDTH: &str = "width";
        pub const HEIGHT: &str = "height";
        pub const MIME_TYPE: &str = "mime_type";
        pub const DURATION: &str = "media_duration";
        pub const CAPTION: &str = "media_caption";
    }

    pub mod message_location {
        pub const LAT: &str = "latitude";
        pub const LON: &str = "longitude";
        pub const NAME: &str = "place_name";
        pub const ADDR: &str = "place_address";
        pub const DURATION: &str = "live_location_share_duration";
    }

    pub mod message_revoked {
        pub const REVOKED_KEY: &str = "revoked_key_id";
        pub const REVOKE_TIMESTAMP: &str = "revoke_timestamp";
    }

    pub mod call_logs {
        pub const TIMESTAMP: &str = "timestamp";
        pub const FROM_ME: &str = "from_me";
        pub const CALL_ID: &str = "call_id";
        pub const DURATION: &str = "duration";
    }

    pub const SENDER_JID: &str = "sender_jid";
    pub const GROUP_USER_JID: &str = "group_user_jid";
    pub const MIGRATE_USER_JID: &str = "migrate_user_jid";
    pub const PARENT_KEY_ID: &str = "parent_key_id";
}

fn parse_chats(conn: &Connection, ds_uuid: &PbUuid, users: &mut Users) -> Result<Vec<ChatWithMessages>> {
    let mut cwms_map: HashMap<Jid, ChatWithMessages> = Default::default();
    let myself_id = users.myself_id.unwrap();

    const WA_OFFICIAL_ACCT_JID: &str = "0@s.whatsapp.net";

    // Preliminarily populating chats map.
    // member_ids and msg_count in сhat needs to be populated later.
    let mut stmt = {
        use columns::message::*;
        conn.prepare(&format!(r#"
            SELECT
                chat.*,
                jid.raw_string AS jid,
                COUNT(message._id) AS msgs_count
            FROM chat
            INNER JOIN jid ON jid._id = chat.jid_row_id
            LEFT JOIN message ON message.{CHAT_ROW_ID} = chat._id
            WHERE jid.raw_string <> "{WA_OFFICIAL_ACCT_JID}"
            GROUP BY chat._id
            HAVING msgs_count > 0
        "#))?
    };
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        // This is both chat and user ID
        let jid = row.get::<_, String>("jid")?;
        let id = hash_to_id(&jid);
        let (name_option, tpe) = match row.get::<_, Option<String>>(columns::chat::SUBJECT)? {
            subject @ Some(_) => {
                // Subject is only set for group chats
                (subject, ChatType::PrivateGroup)
            }
            None => {
                let user = users.id_to_user.get(&UserId(id)).unwrap();
                (user.pretty_name_option(), ChatType::Personal)
            }
        };

        cwms_map.insert(jid.clone(), ChatWithMessages {
            chat: Chat {
                ds_uuid: ds_uuid.clone(),
                id,
                name_option,
                source_type: SourceType::WhatsappDb as i32,
                tpe: tpe as i32,
                img_path_option: Some(format!("files/Avatars/{jid}.j")),
                member_ids: vec![],
                msg_count: 0, // Some messages might be filtered out later, so at this point we're leaving it unset
                main_chat_id: None,
            },
            messages: Vec::with_capacity(row.get::<_, usize>("msgs_count")?),
        });
    }

    /*
     * Notes:
     * - For 1-on-1 chats, message JID matches user JID, otherwise it's specified in message.sender_jid_row_id.
     * - Quoting is a bit of a mess. `message_quoted` has a quoted text and key, but not a quoted message row id.
     *   Joining parent message by key_id is very expensive, so we're doing a lookup in code instead.
     * - Forwarded messages do not specify source.
     * - Call logs are stored separately - in call_log table.
     * - For source_id, we're using hash of `message.key_id` and `call_log.call_id`.
     */
    let mut msgs_stmt = {
        use columns::{*, chat::*, message::*, message_revoked::*};
        fn join_by_message_id(table_name: &str) -> String {
            format!("LEFT JOIN {table_name} ON {table_name}.message_row_id = message._id")
        }
        conn.prepare(&format!(
            r"SELECT
                  CASE
                    WHEN {RECIPIENT_COUNT} == 0 THEN chat_jid.raw_string
                    ELSE sender_jid.raw_string
                  END AS {SENDER_JID},
                  chat.{SUBJECT},
                  message.*,
                  message_edit_info.edited_timestamp,
                  message_quoted.key_id AS {PARENT_KEY_ID},
                  message_forwarded.forward_score,
                  {},
                  {},
                  message_vcard.vcard,
                  message_revoked.{REVOKED_KEY},
                  message_revoked.{REVOKE_TIMESTAMP},
                  message_system.action_type,
                  message_system_group.is_me_joined,
                  group_user_jid.raw_string AS {GROUP_USER_JID},
                  migrate_user_jid.raw_string AS {MIGRATE_USER_JID},
                  message_system_block_contact.is_blocked
              FROM message
              INNER JOIN chat                  ON chat._id             = message.chat_row_id
              INNER JOIN jid  chat_jid         ON chat_jid._id         = chat.jid_row_id
              LEFT  JOIN jid  sender_jid       ON sender_jid._id       = message.{SENDER_JID_ROW_ID}
              {}
              {}
              {}
              {}
              {}
              {}
              {}
              {}
              {}
              {}
              {}
              {}
              LEFT  JOIN jid  group_user_jid   ON group_user_jid._id   = message_system_chat_participant.user_jid_row_id
              LEFT  JOIN jid  migrate_user_jid ON migrate_user_jid._id = message_system_number_change.old_jid_row_id
              WHERE chat_jid.raw_string = ?1
              ORDER BY message.sort_id ASC",
            {
                use columns::message_media::*;
                [FILE_PATH, NAME, WIDTH, HEIGHT, MIME_TYPE, DURATION, CAPTION].iter()
                    .map(|c| format!("message_media.{c}")).join(", ")
            },
            {
                use columns::message_location::*;
                let rest = [NAME, ADDR, DURATION].iter()
                    .map(|c| format!("message_location.{c}")).join(", ");
                format!("CAST(message_location.{LAT} AS text) AS {LAT}, CAST(message_location.{LON} AS text) AS {LON}, {rest}")
            },
            join_by_message_id("message_edit_info"),
            join_by_message_id("message_quoted"),
            join_by_message_id("message_forwarded"),
            join_by_message_id("message_media"),
            join_by_message_id("message_location"),
            join_by_message_id("message_vcard"),
            join_by_message_id("message_revoked"),
            join_by_message_id("message_system"),
            join_by_message_id("message_system_group"),
            join_by_message_id("message_system_chat_participant"),
            join_by_message_id("message_system_number_change"),
            join_by_message_id("message_system_block_contact"),
        ))?
    };
    let mut calls_stmt = {
        use columns::*;
        conn.prepare(&format!(
            r"SELECT
                  jid.raw_string AS {SENDER_JID},
                  call_log.*
              FROM call_log
              INNER JOIN jid  ON jid._id         = call_log.jid_row_id
              INNER JOIN chat ON chat.jid_row_id = jid._id
              WHERE jid.raw_string = ?1
              ORDER BY call_log.timestamp ASC",
        ))?
    };

    for (jid, cwm) in cwms_map.iter_mut() {
        let mut msg_rows = msgs_stmt.query([jid])?;
        let mut call_rows = calls_stmt.query([jid])?;
        let chat: &mut Chat = &mut cwm.chat;
        let chat_tpe = ChatType::resolve(chat.tpe).unwrap();

        let mut member_ids: HashSet<UserId, Hasher> = Default::default();
        member_ids.insert(myself_id);

        let mut msg_key_to_source_id: HashMap<MessageKey, i64, Hasher> = Default::default();

        while let Some(row) = msg_rows.next()? {
            let from_me = match row.get(columns::message::FROM_ME)? {
                0 => false,
                1 => true,
                _ => panic!("Unexpected '{}' value!", columns::message::FROM_ME)
            };
            let sender_jid = &row.get::<_, Option<String>>(columns::SENDER_JID)?;

            // WhatsApp is weird in this aspect. When it comes to group chat, from_me is set to 1 on
            // system messages even though sender JID points to the real actor.
            // If this is a personal chat, non-myself sender ID matches chat ID.
            let from_id: UserId = match chat_tpe {
                ChatType::Personal =>
                    if from_me { myself_id } else { UserId(chat.id) },
                ChatType::PrivateGroup => match sender_jid {
                    None => myself_id,
                    Some(sender_jid) => UserId(hash_to_id(sender_jid))
                },
            };

            assert!(users.id_to_user.contains_key(&from_id));
            member_ids.insert(from_id);

            let msg_tpe = row.get::<_, i32>(columns::message::TYPE)?;
            let msg_tpe = FromPrimitive::from_i32(msg_tpe).with_context(|| format!("Unknown message type ID: {msg_tpe}"))?;

            let (typed, text_column) = {
                let result_option = match msg_tpe {
                    MessageType::System | MessageType::MissedCall =>
                        parse_system_message(row, msg_tpe, users, &mut member_ids)?,
                    MessageType::VideoCall =>
                        None, // Will be processed when parsing call_rows
                    _ =>
                        parse_regular_message(row, msg_tpe, &msg_key_to_source_id)?
                };
                match result_option {
                    Some(v) => v,
                    None => continue
                }
            };

            // Technically, text uses markdown, but oh well
            let text = text_column.map(|col| row.get::<_, Option<String>>(col));
            let text = match text {
                None => vec![], // Data type implies no text
                Some(Ok(None)) => vec![], // Text not supplies
                Some(Ok(Some(s))) if s.is_empty() => vec![],
                Some(Ok(Some(text))) => vec![RichText::make_plain(text)],
                Some(Err(e)) => return Err(e)?
            };

            let key: MessageKey = row.get(columns::message::KEY)?;
            let source_id = hash_to_id(&key);
            msg_key_to_source_id.insert(key, source_id);

            // Deleted message has a different key ID. This is important when users are replying to the message
            // that was later deleted. To fix this, we're linking a deleted key to existing placeholder deleted message.
            if msg_tpe == MessageType::Deleted {
                let revoked_key: MessageKey = row.get(columns::message_revoked::REVOKED_KEY)?;
                msg_key_to_source_id.insert(revoked_key, source_id);
            }

            let ts = row.get::<_, i64>(columns::message::TIMESTAMP)?;

            cwm.messages.push(Message::new(
                *NO_INTERNAL_ID,
                Some(source_id),
                ts / 1000,
                from_id,
                text,
                typed,
            ));
        }

        while let Some(row) = call_rows.next()? {
            if chat_tpe == ChatType::PrivateGroup {
                // TODO: Not sure how group chat calls work here
                log::warn!("Group chat call found and skipped for chat {}!", name_or_unnamed(&chat.name_option));
            }
            let from_id: UserId = match row.get(columns::call_logs::FROM_ME)? {
                1 => myself_id,
                0 => UserId(hash_to_id(&row.get::<_, String>(columns::SENDER_JID)?)),
                _ => unreachable!()
            };
            assert!(users.id_to_user.contains_key(&from_id));
            member_ids.insert(from_id);

            let key: String = row.get(columns::call_logs::CALL_ID)?;
            let source_id = hash_to_id(&key);
            msg_key_to_source_id.insert(key, source_id);

            use message_service::SealedValueOptional;
            cwm.messages.push(Message::new(
                *NO_INTERNAL_ID,
                Some(source_id),
                row.get::<_, i64>(columns::call_logs::TIMESTAMP)? / 1000,
                from_id,
                vec![],
                message_service!(SealedValueOptional::PhoneCall(MessageServicePhoneCall {
                    duration_sec_option: get_zero_as_null(row, columns::call_logs::DURATION)?,
                    discard_reason_option: None,
                    members: vec![],
                })),
            ));
        }

        // We're relying on sort_by_key being stable
        cwm.messages.sort_by_key(|m| m.timestamp);
        cwm.messages.iter_mut().enumerate().for_each(|(i, m)| m.internal_id = i as i64);

        chat.msg_count = cwm.messages.len() as i32;
        chat.member_ids = member_ids.into_iter().map(|id| *id).sorted().collect_vec();
    }

    // WhatsApp has a lot of chats with block/unblock/migration messages only, which might be related to
    // changing phone number. These chats are not interesting.
    Ok(cwms_map.into_values()
        .filter(|cwm| cwm.chat.msg_count > 0)
        .filter(|cwm| cwm.messages.iter().any(|m| matches!(m.typed(), message::Typed::Regular(_))))
        .collect_vec())
}

/// Returns `None` for rows that should be skipped.
fn parse_system_message<'a>(
    row: &Row,
    msg_tpe: MessageType,
    users: &'a mut Users,
    chat_member_ids: &mut HashSet<UserId, Hasher>,
) -> Result<Option<(message::Typed, Option<&'static str>)>> {
    use message_service::SealedValueOptional;
    use message_service::SealedValueOptional::*;
    let mut text_column = Some(columns::message::TEXT);
    let val: SealedValueOptional = match msg_tpe {
        MessageType::System => {
            let action_type = row.get::<_, i32>("action_type")?;
            let action_type = FromPrimitive::from_i32(action_type)
                .with_context(|| format!("Unknown system message type ID: {action_type}"))?;

            let mut get_group_user = |users: &'a mut Users, column: &str| -> Result<&'a User> {
                let user_id = UserId(hash_to_id(&row.get::<_, String>(column)?));

                if row.get::<_, Option<i8>>("is_me_joined")? == Some(1) {
                    // Found a second reference to myself! Time to update
                    // Also, workaround for mut-immut borrowing from id_to_user
                    let user = users.id_to_user.get(&user_id)
                        .unwrap_or_else(|| panic!("{}", row.get::<_, String>(column).unwrap())).clone();
                    let myself_id = users.myself_id.unwrap();
                    chat_member_ids.insert(myself_id);
                    let myself: &mut User = users.id_to_user.get_mut(&myself_id).unwrap();
                    if myself.first_name_option.is_none() { myself.first_name_option = user.first_name_option };
                    if myself.last_name_option.is_none() { myself.last_name_option = user.last_name_option };
                    if myself.username_option.is_none() { myself.username_option = user.username_option };
                    if myself.phone_number_option.is_none() { myself.phone_number_option = user.phone_number_option };
                    Ok(myself)
                } else {
                    chat_member_ids.insert(user_id);
                    Ok(&users.id_to_user[&user_id])
                }
            };

            match action_type {
                SystemActionType::GroupPhotoChange => {
                    // We only know some weird "new_photo_id" that leads nowhere
                    text_column = None; // Text is a new_photo_id
                    GroupEditPhoto(MessageServiceGroupEditPhoto {
                        photo: ContentPhoto {
                            path_option: None,
                            width: 0,
                            height: 0,
                            mime_type_option: None,
                            is_one_time: false,
                        }
                    })
                }
                SystemActionType::GroupCreate => {
                    text_column = None; // Text is a title
                    GroupCreate(MessageServiceGroupCreate {
                        title: row.get(columns::message::TEXT)?,
                        members: vec![],
                    })
                }
                SystemActionType::GroupUserAdd => {
                    let user = get_group_user(users, columns::GROUP_USER_JID)?;
                    GroupInviteMembers(MessageServiceGroupInviteMembers {
                        members: vec![user.pretty_name()],
                    })
                }
                SystemActionType::GroupUserRemove => {
                    let user = get_group_user(users, columns::GROUP_USER_JID)?;
                    GroupRemoveMembers(MessageServiceGroupRemoveMembers {
                        members: vec![user.pretty_name()],
                    })
                }
                SystemActionType::PhoneNumberChange => {
                    let old_user = get_group_user(users, columns::MIGRATE_USER_JID)?;
                    GroupMigrateFrom(MessageServiceGroupMigrateFrom {
                        title: old_user.phone_number_option.as_ref().unwrap_or(&old_user.pretty_name()).clone(),
                    })
                }
                SystemActionType::BlockContact => {
                    text_column = None; // Text is a literal true/false string
                    BlockUser(MessageServiceBlockUser {
                        is_blocked: row.get::<_, i8>("is_blocked")? == 1
                    })
                }
                SystemActionType::PrivacyProvider | SystemActionType::DisappearTimerDisabled |
                SystemActionType::BecameBusinessAccount | SystemActionType::BusinessState |
                SystemActionType::IsAContact => {
                    return Ok(None);
                }
            }
        }
        MessageType::MissedCall =>
            PhoneCall(MessageServicePhoneCall {
                duration_sec_option: None,
                discard_reason_option: Some("missed".to_owned()),
                members: vec![],
            }),
        _ => unreachable!()
    };

    Ok(Some((message_service!(val), text_column)))
}

/// Returns `None` for rows that should be skipped.
fn parse_regular_message(
    row: &Row,
    msg_tpe: MessageType,
    msg_key_to_source_id: &HashMap<MessageKey, i64, Hasher>,
) -> Result<Option<(message::Typed, Option<&'static str>)>> {
    let mut text_column = Some(columns::message::TEXT);

    macro_rules! get_mandatory_int {
        ($col:expr, $col_name:expr) => {get_zero_as_null(row, $col)?.expect(concat!("No ", $col_name, " specified!"))};
    }
    macro_rules! get_mandatory_width { () => { get_mandatory_int!(columns::message_media::WIDTH, "width") }; }
    macro_rules! get_mandatory_height { () => { get_mandatory_int!(columns::message_media::HEIGHT, "height") }; }

    fn get_media_path_and_file_name(row: &Row) -> Result<(Option<String>, Option<String>)> {
        let path: Option<String> = row.get(columns::message_media::FILE_PATH)?;
        let name: Option<String> = row.get(columns::message_media::NAME)?;
        let name = name.or_else(||
        path.as_ref().map(|p| p.rsplit_once('/').unwrap_or(("", p)).1.to_owned()));
        Ok((path, name))
    }

    let mime_type_option =
        row.get::<_, Option<String>>(columns::message_media::MIME_TYPE)?
            .and_then(|s| if s.is_empty() { None } else { Some(s) });
    // TODO: Extract thumbnails from message_thumbnails (not message_thumbnail!) and media_hash_thumbnail
    let contents = match msg_tpe {
        MessageType::Text => vec![],
        MessageType::Picture =>
            vec![content!(Photo  {
                path_option: row.get(columns::message_media::FILE_PATH)?, // TODO: One-time photos
                width: get_mandatory_width!(),
                height: get_mandatory_height!(),
                mime_type_option,
                is_one_time: false,
            })],
        MessageType::OneTimePhoto => {
            text_column = None;
            vec![content!(Photo {
                path_option: None, // TODO!
                width: get_mandatory_width!(),
                height: get_mandatory_height!(),
                mime_type_option,
                is_one_time: true,
            })]
        }
        MessageType::Audio => {
            let (path_option, file_name_option) = get_media_path_and_file_name(row)?;
            vec![content!(VoiceMsg {
                path_option,
                file_name_option,
                mime_type: mime_type_option.expect("MIME type missing"),
                duration_sec_option: get_zero_as_null(row, columns::message_media::DURATION)?,
            })]
        }
        MessageType::Video | MessageType::AnimatedGif => {
            text_column = None;
            // TODO: One-time videos
            let (path_option, file_name_option) = get_media_path_and_file_name(row)?;
            vec![content!(VideoMsg {
                path_option,
                file_name_option,
                width: get_mandatory_width!(),
                height: get_mandatory_height!(),
                mime_type: mime_type_option.expect("MIME type missing"),
                duration_sec_option: get_zero_as_null(row, columns::message_media::DURATION)?,
                thumbnail_path_option: None,
                is_one_time: false,
            })]
        }
        MessageType::OneTimeVideo =>
            vec![content!(VideoMsg {
                path_option: None, // TODO!
                file_name_option: None, // TODO!
                width: get_mandatory_width!(),
                height: get_mandatory_height!(),
                mime_type: mime_type_option.expect("MIME type missing"),
                duration_sec_option: get_zero_as_null(row, columns::message_media::DURATION)?,
                thumbnail_path_option: None,
                is_one_time: true,
            })],
        MessageType::Document => {
            // For some reason, text is moved here
            text_column = Some(columns::message_media::CAPTION);
            let (path_option, file_name_option) = get_media_path_and_file_name(row)?;
            vec![content!(File {
                path_option,
                file_name_option,
                mime_type_option,
                thumbnail_path_option: None,
            })]
        }
        MessageType::AnimatedSticker => {
            let (mut w, mut h) = (
                get_zero_as_null(row, columns::message_media::WIDTH)?.expect("No width specified!"),
                get_zero_as_null(row, columns::message_media::HEIGHT)?.expect("No height specified!")
            );
            // Sticker sizes are weird, enlarging them is they're too small
            while w < 256 && h < 256 {
                w *= 2;
                h *= 2;
            }
            let (path_option, file_name_option) = get_media_path_and_file_name(row)?;
            vec![content!(Sticker {
                path_option,
                file_name_option,
                width: w,
                height: h,
                mime_type_option,
                thumbnail_path_option: None,
                emoji_option: None,
            })]
        }
        MessageType::ContactVcard => {
            text_column = None; // Text is a contact name, we have it already
            let vcard = parse_vcard(&row.get::<_, String>("vcard")?)?;
            vec![content!(SharedContact { ..vcard })]
        }
        MessageType::StaticLocation | MessageType::LiveLocation => {
            // Since there's no point in having more than 8 precision digits, we're only storing 8.
            // Having more will mean database content will mismatch after saving, so we're stripping the rest.
            fn reduce_precision(str: String) -> String {
                match str.find('.') {
                    Some(i) if str.len() - i > 8 => str[0..=(i + 8)].to_owned(),
                    _ => str
                }
            }
            vec![content!(Location {
                title_option: row.get(columns::message_location::NAME)?,
                address_option: row.get(columns::message_location::ADDR)?,
                lat_str: reduce_precision(row.get(columns::message_location::LAT)?),
                lon_str: reduce_precision(row.get(columns::message_location::LON)?),
                duration_sec_option: row.get(columns::message_location::DURATION)?,
            })]
        }
        MessageType::Deleted => {
            // No content available.
            vec![]
        }
        // We're not interested in these
        MessageType::WaitingForMessage | MessageType::BusinessItem | MessageType::BusinessItemTemplated |
        MessageType::OneTimePassword | MessageType::WhatsAppMessage | MessageType::DisappearTimerSet =>
            return Ok(None),
        MessageType::System => unreachable!(),
        MessageType::MissedCall => unreachable!(),
        MessageType::VideoCall => unreachable!(),
    };

    // WhatsApp does not preserve real source
    let forward_from_name_option = row.get::<_, Option<i64>>("forward_score")?
        .map(|_| SOMEONE.to_owned());

    // Note 1: We could *technically* restore deleted message content when replying to the original!
    //         Not doing that now though.
    // Note 2: Original message might be missing for some reason, e.g. it happens if the reply itself was edited.
    //         WA simply doesn't show it as a reply in such case, so do we.
    let reply_to_message_id_option =
        row.get::<_, Option<MessageKey>>(columns::PARENT_KEY_ID)?
            .and_then(|key_id| msg_key_to_source_id.get(&key_id))
            .copied();

    let is_deleted = msg_tpe == MessageType::Deleted;
    // For deleted messages, edit time is deletion time.
    let edit_timestamp_col = if is_deleted { columns::message_revoked::REVOKE_TIMESTAMP } else { "edited_timestamp" };
    Ok(Some((message_regular! {
        edit_timestamp_option: row.get::<_, Option<i64>>(edit_timestamp_col)?.map(|ts| ts / 1000),
        is_deleted,
        forward_from_name_option,
        reply_to_message_id_option,
        contents,
    }, text_column)))
}

fn get_zero_as_null(row: &Row, col_name: &str) -> Result<Option<i32>> {
    Ok(row.get::<_, Option<i32>>(col_name)?.filter(|&i| i != 0))
}

fn parse_vcard(vcard: &str) -> Result<ContentSharedContact> {
    let mut vcard = VcardParser::new(BufReader::new(vcard.as_bytes()));
    let vcard = vcard.next().unwrap()?;

    let full_name = vcard.properties.iter()
        .find(|p| p.name == "FN")
        .and_then(|p| p.value.clone())
        .expect("Name not found for vcard!");

    let phone_number = vcard.properties.iter()
        .filter(|p| p.name.split('.').contains(&"TEL"))
        .find(|p| p.params.as_ref().is_some_and(|params| params.iter().any(|(k, _)| k == "WAID")))
        .and_then(|p| p.value.clone())
        .expect("Phone number not found for vcard!");

    Ok(ContentSharedContact {
        first_name_option: Some(full_name),
        last_name_option: None,
        phone_number_option: Some(phone_number),
        vcard_path_option: None,
    })
}
