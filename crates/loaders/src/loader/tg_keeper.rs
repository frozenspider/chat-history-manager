use crate::loader::DataLoader;
use crate::prelude::*;
use chrono::Local;
use rusqlite::Connection;
use std::collections::BTreeMap;

use grammers_client::grammers_tl_types::Deserializable;
use grammers_client::{grammers_tl_types as tl, types};
use itertools::Itertools;
use utf16string::{BE, WString};

/// Loader for [tg-keeper](https://github.com/frozenspider/tg-keeper/) database.
/// This should follow closely what [[TelegramDataLoader]] does.
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
            if let Some(msg) = parse_message(inner_msg, raw_msg.media_rel_path, &users, myself_id)?
            {
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
    users: &HashMap<UserId, User>,
    myself_id: UserId,
) -> Result<Option<Message>> {
    let id = raw_message.id() as i64;
    let from_id = raw_message.author_id(myself_id);
    let (tg_date, text, typed) = match raw_message {
        tl::enums::Message::Message(inner) => {
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
            (inner.date, text, typed)
        }
        tl::enums::Message::Service(inner) => {
            if let Some((service, text)) = parse_service_message(&inner, media_rel_path, users)? {
                (inner.date, text, message::Typed::Service(service))
            } else {
                return Ok(None);
            }
        }
        tl::enums::Message::Empty(inner) => {
            panic!("Empty message: {:?}", inner); // FIXME
        }
    };
    let timestamp = tg_date as i64;

    Ok(Some(Message::new(
        id,
        Some(id),
        timestamp,
        UserId(from_id),
        text,
        typed,
    )))
}

fn parse_text(
    message: &str,
    entities: &[tl::enums::MessageEntity],
) -> Result<Vec<RichTextElement>> {
    if entities.is_empty() {
        // Quick path that avoids all UTF-16 hustle
        return Ok(vec![RichText::make_plain(message.to_owned())]);
    }

    let mut result = vec![];
    let mut curr_offset = 0_usize;
    let mut entities_iter = entities.iter();

    // Message entities offset/length are given in UTF-16 code units, so do the conversion
    let message = WString::<BE>::from(message);

    while curr_offset < message.len() {
        if let Some(entity) = entities_iter.next() {
            let entity_offset = entity.offset() as usize;
            let entity_length = entity.length() as usize;
            // The offset is given in UTF-16 code units, so we need to convert it to bytes

            let entity_offset = entity_offset * 2;
            let entity_length = entity_length * 2;

            assert!(
                entity_offset >= curr_offset,
                "Incorrect offset, or double formatting"
            );

            if entity_offset > curr_offset {
                let plaintext = message[curr_offset..entity_offset].to_utf8();
                result.push(RichText::make_plain(plaintext));
            }

            let entity_text = message[entity_offset..(entity_offset + entity_length)].to_utf8();

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
                    result.push(RichText::make_prefmt_block(
                        entity_text,
                        if inner.language.is_empty() {
                            None
                        } else {
                            Some(inner.language.clone())
                        },
                    ));
                }
                tl::enums::MessageEntity::TextUrl(inner) => {
                    result.push(RichText::make_link(Some(entity_text), inner.url.clone()));
                }
                tl::enums::MessageEntity::Url(_) => {
                    result.push(RichText::make_link(Some(entity_text.clone()), entity_text));
                }
                tl::enums::MessageEntity::Mention(_) // @ is already prepended
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

            curr_offset = entity_offset + entity_length;
        } else {
            break;
        }
    }

    let plaintext = message[curr_offset..].to_utf8();
    if !plaintext.is_empty() {
        result.push(RichText::make_plain(plaintext));
    }

    Ok(result)
}

fn parse_media(
    media: tl::enums::MessageMedia,
    media_rel_path: Option<String>,
) -> Result<Option<Content>> {
    Ok(todo!())
}

fn parse_service_message(
    raw_service_msg: &tl::types::MessageService,
    media_rel_path: Option<String>,
    users: &HashMap<UserId, User>,
) -> Result<Option<(MessageService, Vec<RichTextElement>)>> {
    use message_service::SealedValueOptional;
    use tl::enums::MessageAction;

    let resolve_user_name = |user_id: i64| -> String {
        if let Some(user) = users.get(&UserId(user_id)) {
            user.pretty_name()
        } else {
            format!("Unknown user {}", user_id)
        }
    };

    let (sealed_value, rich_text): (SealedValueOptional, Option<String>) =
        match &raw_service_msg.action {
            MessageAction::PhoneCall(action) => {
                let discard_reason_option = action.reason.as_ref().map(|reason| {
                    match reason {
                        tl::enums::PhoneCallDiscardReason::Missed => "missed",
                        tl::enums::PhoneCallDiscardReason::Busy => "busy",
                        tl::enums::PhoneCallDiscardReason::Hangup => "hangup",
                        tl::enums::PhoneCallDiscardReason::Disconnect => "disconnect",
                        tl::enums::PhoneCallDiscardReason::AllowGroupCall(_) => {
                            unreachable!("This is not in the docs! {:?}", reason)
                        }
                    }
                    .to_owned()
                });
                (
                    SealedValueOptional::PhoneCall(MessageServicePhoneCall {
                        duration_sec_option: action.duration,
                        discard_reason_option,
                        members: vec![],
                    }),
                    None,
                )
            }
            MessageAction::GroupCall(action) => (
                SealedValueOptional::PhoneCall(MessageServicePhoneCall {
                    duration_sec_option: action.duration,
                    discard_reason_option: None,
                    members: vec![],
                }),
                None,
            ),
            MessageAction::PinMessage => {
                (
                    SealedValueOptional::PinMessage(MessageServicePinMessage {
                        message_source_id: raw_service_msg.id as i64, // FIXME
                    }),
                    None,
                )
            }
            MessageAction::ChatCreate(action) => (
                SealedValueOptional::GroupCreate(MessageServiceGroupCreate {
                    title: action.title.clone(),
                    members: action.users.iter().map(|u| u.to_string()).collect(),
                }),
                None,
            ),
            MessageAction::ChatEditTitle(action) => (
                SealedValueOptional::GroupEditTitle(MessageServiceGroupEditTitle {
                    title: action.title.clone(),
                }),
                None,
            ),
            MessageAction::ChatEditPhoto(action) => {
                let (width, height) = action.photo.size().unwrap_or((0, 0));
                (
                    SealedValueOptional::GroupEditPhoto(MessageServiceGroupEditPhoto {
                        photo: ContentPhoto {
                            path_option: media_rel_path,
                            width,
                            height,
                            mime_type_option: None,
                            is_one_time: false,
                        },
                    }),
                    None,
                )
            }
            MessageAction::ChatDeletePhoto => (
                SealedValueOptional::GroupDeletePhoto(MessageServiceGroupDeletePhoto {}),
                None,
            ),
            MessageAction::ChatAddUser(action) => (
                SealedValueOptional::GroupInviteMembers(MessageServiceGroupInviteMembers {
                    members: action.users.iter().map(|u| u.to_string()).collect(),
                }),
                None,
            ),
            MessageAction::ChatDeleteUser(action) => (
                SealedValueOptional::GroupRemoveMembers(MessageServiceGroupRemoveMembers {
                    members: vec![action.user_id.to_string()],
                }),
                None,
            ),
            MessageAction::ChatJoinedByLink(action) => (
                SealedValueOptional::GroupInviteMembers(MessageServiceGroupInviteMembers {
                    members: vec![resolve_user_name(action.inviter_id)],
                }),
                None,
            ),
            MessageAction::ChatJoinedByRequest => (
                SealedValueOptional::GroupInviteMembers(MessageServiceGroupInviteMembers {
                    members: raw_service_msg
                        .from_id
                        .as_ref()
                        .map(|m| resolve_user_name(m.id()))
                        .into_iter()
                        .collect_vec(),
                }),
                None,
            ),
            MessageAction::ChannelCreate(action) => (
                SealedValueOptional::GroupCreate(MessageServiceGroupCreate {
                    title: action.title.clone(),
                    members: vec![],
                }),
                None,
            ),
            MessageAction::ChatMigrateTo(_action) => (
                SealedValueOptional::GroupMigrateTo(MessageServiceGroupMigrateTo {}),
                None,
            ),
            MessageAction::ChannelMigrateFrom(action) => (
                SealedValueOptional::GroupMigrateFrom(MessageServiceGroupMigrateFrom {
                    title: action.title.clone(),
                }),
                None,
            ),
            MessageAction::HistoryClear => (
                SealedValueOptional::ClearHistory(MessageServiceClearHistory {}),
                None,
            ),
            MessageAction::InviteToGroupCall(action) => (
                SealedValueOptional::PhoneCall(MessageServicePhoneCall {
                    duration_sec_option: None,
                    discard_reason_option: None,
                    members: action
                        .users
                        .iter()
                        .map(|id| resolve_user_name(*id))
                        .collect(),
                }),
                None,
            ),
            MessageAction::SetMessagesTtl(action) => {
                let mut period = action.period as i64;
                let mut period_str = "second(s)";
                let div_list = [(60, "minute(s)"), (60, "hour(s)"), (24, "day(s)")];
                for (divisor, new_period_str) in div_list.iter() {
                    if period % divisor != 0 {
                        break;
                    }
                    period /= divisor;
                    period_str = new_period_str;
                }
                (
                    SealedValueOptional::Notice(MessageServiceNotice {}),
                    Some(format!(
                        "Messages will be auto-deleted in {period} {period_str}"
                    )),
                )
            }
            MessageAction::ContactSignUp => (
                SealedValueOptional::Notice(MessageServiceNotice {}),
                Some("Joined Telegram".to_owned()),
            ),
            MessageAction::ScreenshotTaken => {
                return Ok(None);
            }
            MessageAction::GameScore(_) => {
                return Ok(None);
            }
            MessageAction::PaymentSentMe(_) | MessageAction::PaymentSent(_) => {
                return Ok(None);
            }
            MessageAction::SecureValuesSentMe(_) | MessageAction::SecureValuesSent(_) => {
                // Telegram Passport stuff
                return Ok(None);
            }
            MessageAction::GeoProximityReached(_) => {
                return Ok(None);
            }
            MessageAction::GroupCallScheduled(_) => {
                return Ok(None);
            }
            MessageAction::SetChatTheme(_) => {
                return Ok(None);
            }
            MessageAction::BotAllowed(_)
            | MessageAction::CustomAction(_)
            | MessageAction::WebViewDataSentMe(_)
            | MessageAction::WebViewDataSent(_)
            | MessageAction::RequestedPeer(_)
            | MessageAction::PaymentRefunded(_)
            | MessageAction::RequestedPeerSentMe(_) => {
                // Bot-specific stuff
                return Ok(None);
            }
            MessageAction::GiftPremium(_) | MessageAction::GiftCode(_) => {
                return Ok(None);
            }
            MessageAction::TopicCreate(_) | MessageAction::TopicEdit(_) => {
                // Topics aren't handled
                return Ok(None);
            }
            MessageAction::SuggestProfilePhoto(_) => {
                // Suggest profile photo (not handled)
                return Ok(None);
            }
            MessageAction::SetChatWallPaper(_) => {
                // Set chat wallpaper (not handled)
                return Ok(None);
            }
            MessageAction::GiveawayLaunch(_)
            | MessageAction::GiveawayResults(_)
            | MessageAction::BoostApply(_) => {
                // Boost apply (not handled)
                return Ok(None);
            }
            MessageAction::GiftStars(_)
            | MessageAction::PrizeStars(_)
            | MessageAction::StarGift(_)
            | MessageAction::StarGiftUnique(_) => {
                // Stars
                return Ok(None);
            }
            MessageAction::Empty => {
                // Empty action?
                return Ok(None);
            }
        };

    Ok(Some((
        MessageService {
            sealed_value_optional: Some(sealed_value),
        },
        rich_text
            .into_iter()
            .map(RichText::make_plain)
            .collect_vec(),
    )))
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

trait WithAuthorId {
    fn author_id(&self, myself_id: UserId) -> i64;
}

impl WithAuthorId for tl::enums::Message {
    fn author_id(&self, myself_id: UserId) -> i64 {
        let (from_id, peer_id, out) = match self {
            tl::enums::Message::Message(msg) => (
                msg.from_id.as_ref().map(|peer| peer.id()),
                msg.peer_id.id(),
                msg.out,
            ),
            tl::enums::Message::Service(msg) => (
                msg.from_id.as_ref().map(|peer| peer.id()),
                msg.peer_id.id(),
                msg.out,
            ),
            tl::enums::Message::Empty(_) => panic!("Empty message!"),
        };
        from_id.unwrap_or_else(|| if out { *myself_id } else { peer_id })
    }
}

trait WithSize {
    fn size(&self) -> Option<(i32, i32)>;
}

impl WithSize for tl::enums::PhotoSize {
    fn size(&self) -> Option<(i32, i32)> {
        match self {
            tl::enums::PhotoSize::Empty(_) => None,
            tl::enums::PhotoSize::Size(size) => Some((size.w, size.h)),
            tl::enums::PhotoSize::PhotoCachedSize(size) => Some((size.w, size.h)),
            tl::enums::PhotoSize::PhotoStrippedSize(_) => None,
            tl::enums::PhotoSize::Progressive(size) => Some((size.w, size.h)),
            tl::enums::PhotoSize::PhotoPathSize(_) => None,
        }
    }
}

impl WithSize for tl::types::Photo {
    fn size(&self) -> Option<(i32, i32)> {
        self.sizes.iter().filter_map(|s| s.size()).next()
    }
}

impl WithSize for tl::enums::Photo {
    fn size(&self) -> Option<(i32, i32)> {
        match self {
            tl::enums::Photo::Empty(_) => None,
            tl::enums::Photo::Photo(photo) => photo.size(),
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
