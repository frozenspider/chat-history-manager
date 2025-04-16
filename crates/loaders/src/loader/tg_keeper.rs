use crate::loader::DataLoader;
use crate::prelude::*;
use chrono::Local;
use rusqlite::Connection;
use std::collections::BTreeMap;

use grammers_client::grammers_tl_types::Deserializable;
use grammers_client::{grammers_tl_types as tl, types};

/// Loader for [tg-keeper](https://github.com/frozenspider/tg-keeper/) database.
pub struct TgKeeperDataLoader;

const NAME: &str = "TgKeeper";
const FILENAME: &str = "tg-keeper.sqlite";

impl DataLoader for TgKeeperDataLoader {
    fn name(&self) -> String {
        NAME.to_owned()
    }

    fn looks_about_right_inner(&self, path: &Path) -> EmptyRes {
        let filename = path_file_name(path)?;
        if filename == FILENAME {
            Ok(())
        } else {
            err!("File name does not match: {filename} != {FILENAME}")
        }
    }

    fn load_inner(
        &self,
        path: &Path,
        ds: Dataset,
        _user_input_requester: &dyn UserInputBlockingRequester,
    ) -> Result<Box<InMemoryDao>> {
        load_tg_keeper_db(path, ds)
    }
}

fn load_tg_keeper_db(path: &Path, ds: Dataset) -> Result<Box<InMemoryDao>> {
    let ds_root = path.parent().unwrap().to_path_buf();

    let conn = Connection::open(path)?;
    let (users, chats_with_messages, myself_id) = load_everything(&conn, &ds.uuid)?;
    drop(conn);

    let mut result = Box::new(InMemoryDao::new_single(
        format!("{NAME} ({})", Local::now().format("%Y-%m-%d")),
        ds,
        ds_root,
        myself_id,
        users,
        chats_with_messages,
    ));
    // Some users might be added by chats that were skipped from the datasets
    result.remove_orphan_users();
    Ok(result)
}

fn load_everything(
    conn: &Connection,
    ds_uuid: &PbUuid,
) -> Result<(Vec<User>, Vec<ChatWithMessages>, UserId)> {
    let raw_chats = load_raw_chats(conn)?;
    // Note that there are messages with duplicate internal IDs - this is expected,
    // since edited messages are stored as separate entries.
    let raw_messages = load_raw_messages(conn)?;

    let (users, myself_id) = get_users(&raw_chats, ds_uuid)?;

    let mut cwm_builders: HashMap<ChatId, CwmBuilder> = raw_chats
        .iter()
        .filter_map(|raw_chat| {
            let id = raw_chat.id();
            let chat = Chat {
                ds_uuid: ds_uuid.clone(),
                id,
                name_option: raw_chat.name().map(|s| s.to_owned()),
                source_type: SourceType::Telegram as i32,
                tpe: (match raw_chat {
                    types::Chat::User(_) => ChatType::Personal,
                    types::Chat::Group(_) => ChatType::PrivateGroup,
                    types::Chat::Channel(_) => return None, // Skip
                }) as i32,
                img_path_option: None,
                member_ids: vec![], // Will be filled in by builder
                msg_count: 0,       // Will be set by builder
                main_chat_id: None,
            };
            Some((ChatId(id), CwmBuilder::new(chat)))
        })
        .collect();

    for raw_msg in raw_messages {
        if matches!(raw_msg.tpe, RawMessageType::Deleted) {
            mark_message_deleted(&mut cwm_builders, raw_msg.id)?;
        } else {
            let Some(chat_id) = raw_msg.chat_id else {
                bail!(
                    "Chat ID is required for non-deleted message #{}",
                    raw_msg.id.0
                )
            };
            let Some(cwm_builder) = cwm_builders.get_mut(&chat_id) else {
                bail!(
                    "Chat #{} not found for message #{}",
                    chat_id.0,
                    raw_msg.id.0
                )
            };
            let Some(inner_msg) = raw_msg.inner else {
                bail!("Message #{} is missing serialized payload", raw_msg.id.0)
            };
            if let Some(msg) = parse_message(inner_msg, raw_msg.media_rel_path)? {
                cwm_builder.add_message(msg);
            }
        }
    }

    Ok((
        users.into_values().collect(),
        cwm_builders
            .into_values()
            .filter(|b| !b.messages.is_empty())
            .map(|b| b.build(myself_id))
            .collect(),
        myself_id,
    ))
}

fn load_raw_chats(conn: &Connection) -> Result<Vec<types::Chat>> {
    let mut result = vec![];

    let mut stmt = conn.prepare("SELECT serialized FROM chats")?;
    let mut rows = stmt.query([])?;

    while let Some(row) = rows.next()? {
        let serialized: Vec<u8> = row.get("serialized")?;
        let raw_chat = deserialize_raw_chat(&serialized)?;
        result.push(raw_chat);
    }

    Ok(result)
}

fn load_raw_messages(conn: &Connection) -> Result<Vec<RawMessage>> {
    let mut result = vec![];

    let mut stmt = conn.prepare("SELECT * FROM events")?;
    let mut rows = stmt.query([])?;

    while let Some(row) = rows.next()? {
        let internal_id: i64 = row.get("message_id")?;
        let tpe = match row.get::<_, String>("type")?.as_str() {
            "message_new" => RawMessageType::New,
            "message_edited" => RawMessageType::Edited,
            "message_deleted" => RawMessageType::Deleted,
            etc => bail!("Unknown message type: {etc}"),
        };
        let chat_id: Option<i64> = row.get("chat_id")?;
        let serialized: Option<Vec<u8>> = row.get("serialized")?;
        let raw_message = serialized
            .as_deref()
            .map(tl::enums::Message::from_bytes)
            .transpose()?;
        let result_entry = RawMessage {
            id: MessageInternalId(internal_id),
            tpe,
            chat_id: chat_id.map(ChatId),
            inner: raw_message,
            media_rel_path: row.get("media_rel_path")?,
        };
        result.push(result_entry);
    }

    Ok(result)
}

fn get_users(
    raw_chats: &[types::Chat],
    ds_uuid: &PbUuid,
) -> Result<(HashMap<UserId, User>, UserId)> {
    let users: HashMap<UserId, User> = raw_chats
        .iter()
        .filter_map(|raw_chat| match raw_chat {
            types::Chat::User(user) => {
                let id = user.id();
                Some((
                    UserId(id),
                    User {
                        ds_uuid: ds_uuid.clone(),
                        id,
                        first_name_option: user.first_name().map(|s| s.to_owned()),
                        last_name_option: user.last_name().map(|s| s.to_owned()),
                        username_option: user.username().map(|s| s.to_owned()),
                        phone_number_option: user.phone().map(|s| s.to_owned()),
                        profile_pictures: vec![],
                    },
                ))
            }
            _ => None,
        })
        .collect();

    let myself_id = raw_chats
        .iter()
        .find_map(|raw_chat| match raw_chat {
            types::Chat::User(user) if user.is_self() => Some(UserId(user.id())),
            _ => None,
        })
        .ok_or_else(|| anyhow!("Myself ID not found"))?;

    Ok((users, myself_id))
}

fn mark_message_deleted(
    cwm_builders: &mut HashMap<ChatId, CwmBuilder>,
    msg_id: MessageInternalId,
) -> EmptyRes {
    // We don't know which chat has this message, let's make sure there's not more than one
    let mut msg: Option<&mut Message> = None;
    for candidate in cwm_builders.values_mut() {
        if let Some(candidate_msg) = candidate.messages.get_mut(&msg_id) {
            if msg.is_none() {
                msg = Some(candidate_msg);
            } else {
                // More than one chat has this message, we can't handle this
                bail!(
                    "Message #{} is deleted but it's contained in more than one chat",
                    msg_id.0
                );
            }
        }
    }
    if let Some(msg) = msg {
        match &mut msg.typed {
            Some(message::Typed::Regular(msg)) => {
                msg.is_deleted = true;
            }
            Some(etc) => {
                bail!("Message #{} is deleted but it's {:?}", msg_id.0, etc);
            }
            _ => unreachable!(),
        }
    }
    Ok(())
}

fn parse_message(
    raw_message: tl::enums::Message,
    media_rel_path: Option<String>,
) -> Result<Option<Message>> {
    let id = raw_message.id() as i64;
    let (tg_date, from_id, text, typed) = match raw_message {
        tl::enums::Message::Message(inner) => {
            let from_id = inner.from_id.map(|peer| peer.id());
            let forward_from_name_option = inner
                .fwd_from
                .and_then(|tl::enums::MessageFwdHeader::Header(fwd)| fwd.from_name);
            let reply_to_message_id_option = inner.reply_to.and_then(|r| match r {
                tl::enums::MessageReplyHeader::Header(h) => h.reply_to_msg_id.map(|id| id as i64),
                _ => None,
            });
            let text = parse_text(&inner.message, &inner.entities.unwrap_or(vec![]))?;
            let contents = inner
                .media
                .map(|m| parse_media(m, media_rel_path))
                .transpose()?
                .flatten()
                .into_iter()
                .collect();
            let typed = message_regular!(
                edit_timestamp_option: inner.edit_date.map(|tg_date| tg_date as i64),
                is_deleted: false,
                forward_from_name_option,
                reply_to_message_id_option,
                contents,
            );
            (inner.date, from_id, text, typed)
        }
        tl::enums::Message::Service(inner) => {
            if let Some((service, text)) = parse_service_message(&inner)? {
                let from_id = inner.from_id.map(|peer| peer.id());
                (inner.date, from_id, text, message::Typed::Service(service))
            } else {
                return Ok(None);
            }
        }
        tl::enums::Message::Empty(inner) => {
            panic!("Empty message: {:?}", inner); // FIXME
        }
    };
    let timestamp = tg_date as i64;
    let Some(from_id) = from_id else {
        bail!("Message #{} has no sender", id);
    };

    Ok(Some(Message::new(
        id,
        Some(id),
        timestamp,
        UserId(from_id),
        text,
        typed,
    )))
}

fn parse_service_message(
    raw_service_msg: &tl::types::MessageService,
) -> Result<Option<(MessageService, Vec<RichTextElement>)>> {
    todo!()
}

fn parse_text(
    message: &str,
    entities: &[tl::enums::MessageEntity],
) -> Result<Vec<RichTextElement>> {
    let mut result = vec![];
    let mut curr_offset = 0_usize;
    let mut entities_iter = entities.iter();

    while curr_offset < message.len() {
        if let Some(entity) = entities_iter.next() {
            let entity_offset = entity.offset() as usize;
            assert!(entity_offset >= curr_offset, "Incorrect offset");

            if entity_offset > curr_offset {
                let plaintext = &message[curr_offset..entity_offset];
                result.push(RichText::make_plain(plaintext.to_owned()));
            }

            let entity_text =
                message[entity_offset..(entity_offset + entity.length() as usize)].to_owned();

            match entity {
                tl::enums::MessageEntity::Bold(_) => {
                    result.push(RichText::make_bold(entity_text));
                }
                tl::enums::MessageEntity::Italic(_) => {
                    result.push(RichText::make_italic(entity_text));
                }
                tl::enums::MessageEntity::Underline(_) => {
                    result.push(RichText::make_underline(entity_text));
                }
                tl::enums::MessageEntity::Strike(_) => {
                    result.push(RichText::make_strikethrough(entity_text));
                }
                tl::enums::MessageEntity::Blockquote(_) => {
                    result.push(RichText::make_blockquote(entity_text));
                }
                tl::enums::MessageEntity::Spoiler(_) => {
                    result.push(RichText::make_spoiler(entity_text));
                }
                tl::enums::MessageEntity::Code(_) => {
                    result.push(RichText::make_prefmt_inline(entity_text));
                }
                tl::enums::MessageEntity::Pre(inner) => {
                    println!("=== Pre: {:?}", inner); // FIXME
                    result.push(RichText::make_prefmt_block(
                        entity_text,
                        Some(inner.language.clone()),
                    ));
                }
                tl::enums::MessageEntity::TextUrl(inner) => {
                    result.push(RichText::make_link(Some(entity_text), inner.url.clone()));
                }
                tl::enums::MessageEntity::Url(_) => {
                    result.push(RichText::make_link(Some(entity_text.clone()), entity_text));
                }
                tl::enums::MessageEntity::Mention(_)
                | tl::enums::MessageEntity::Hashtag(_)
                | tl::enums::MessageEntity::BotCommand(_)
                | tl::enums::MessageEntity::Email(_)
                | tl::enums::MessageEntity::Phone(_)
                | tl::enums::MessageEntity::Cashtag(_)
                | tl::enums::MessageEntity::BankCard(_)
                | tl::enums::MessageEntity::CustomEmoji(_)
                | tl::enums::MessageEntity::MentionName(_)
                | tl::enums::MessageEntity::InputMessageEntityMentionName(_)
                | tl::enums::MessageEntity::Unknown(_) => {
                    // These are just plain text with formatting
                    result.push(RichText::make_plain(entity_text));
                }
            }

            curr_offset = entity_offset;
        } else {
            break;
        }
    }

    Ok(result)
}

fn parse_media(
    media: tl::enums::MessageMedia,
    media_rel_path: Option<String>,
) -> Result<Option<Content>> {
    Ok(todo!())
}

// Copy-paste from tg-keeper
fn deserialize_raw_chat(serialized: &[u8]) -> Result<types::Chat> {
    // Check the first byte to determine the type of chat
    let chat_type = serialized[0];
    let serialized = &serialized[1..]; // Skip the first byte

    // Deserialize the chat based on its type
    match chat_type {
        0 => {
            let user = tl::enums::User::from_bytes(serialized)?;
            Ok(types::Chat::User(types::chat::User { raw: user }))
        }
        1 => {
            let chat = tl::enums::Chat::from_bytes(serialized)?;
            Ok(types::Chat::Group(types::chat::Group { raw: chat }))
        }
        2 => {
            let channel = tl::types::Channel::from_bytes(serialized)?;
            Ok(types::Chat::Channel(types::chat::Channel { raw: channel }))
        }
        _ => unreachable!("Unknown chat type: {}", chat_type),
    }
}

enum RawMessageType {
    New,
    Edited,
    Deleted,
}

struct RawMessage {
    id: MessageInternalId,
    tpe: RawMessageType,
    chat_id: Option<ChatId>,
    inner: Option<tl::enums::Message>,
    media_rel_path: Option<String>,
}

trait WithId {
    fn id(&self) -> i64;
}

impl WithId for tl::enums::Peer {
    fn id(&self) -> i64 {
        match self {
            tl::enums::Peer::User(user) => user.user_id,
            tl::enums::Peer::Chat(chat) => chat.chat_id,
            tl::enums::Peer::Channel(channel) => channel.channel_id,
        }
    }
}

struct CwmBuilder {
    chat: Chat,
    member_ids: HashSet<UserId>,
    messages: BTreeMap<MessageInternalId, Message>,
}

impl CwmBuilder {
    fn new(chat: Chat) -> Self {
        Self {
            chat,
            member_ids: HashSet::new(),
            messages: BTreeMap::new(),
        }
    }

    /// Silently overwrites existing message, if any
    fn add_message(&mut self, msg: Message) {
        self.member_ids.insert(UserId(msg.from_id));
        self.messages.insert(msg.internal_id(), msg);
    }

    fn build(mut self, myself_id: UserId) -> ChatWithMessages {
        self.chat.member_ids = vec![myself_id.0];
        self.chat.member_ids.extend(
            self.member_ids
                .into_iter()
                .filter(|id| *id != myself_id)
                .map(|id| id.0),
        );
        self.chat.msg_count = self.messages.len() as i32;
        ChatWithMessages {
            chat: self.chat,
            messages: self.messages.into_values().collect(),
        }
    }
}
