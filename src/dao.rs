use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::protobuf::history::*;
use crate::entity_utils::*;
use crate::*;

pub mod in_memory_dao;

/**
 * Everything except for messages should be pre-cached and readily available.
 * Should support equality.
 */
pub trait ChatHistoryDao {
    /** User-friendly name of a loaded data */
    fn name(&self) -> &str;

    /** Directory which stores eveything - including database itself at the root level */
    fn storage_path(&self) -> &Path;

    fn datasets(&self) -> Result<Vec<Dataset>>;

    /** Directory which stores eveything in the dataset. All files are guaranteed to have this as a prefix. */
    fn dataset_root(&self, ds_uuid: &PbUuid) -> DatasetRoot;

    /** List all files referenced by entities of this dataset. Some might not exist. */
    fn dataset_files(&self, ds_uuid: &PbUuid) -> Result<HashSet<PathBuf>>;

    fn myself(&self, ds_uuid: &PbUuid) -> Result<User>;

    /** Contains myself as the first element. Order must be stable. Method is expected to be fast. */
    fn users(&self, ds_uuid: &PbUuid) -> Result<Vec<User>>;

    fn user_option(&self, ds_uuid: &PbUuid, id: i64) -> Result<Option<User>>;

    fn chats(&self, ds_uuid: &PbUuid) -> Result<Vec<ChatWithDetails>>;

    fn chat_option(&self, ds_uuid: &PbUuid, id: i64) -> Result<Option<ChatWithDetails>>;

    /// Return N messages after skipping first M of them. Trivial pagination in a nutshell.
    fn scroll_messages(&self, chat: &Chat, offset: usize, limit: usize) -> Result<Vec<Message>>;

    fn first_messages(&self, chat: &Chat, limit: usize) -> Result<Vec<Message>> {
        self.scroll_messages(chat, 0, limit)
    }

    fn last_messages(&self, chat: &Chat, limit: usize) -> Result<Vec<Message>>;

    /// Return N messages before the given one (exclusive). Message must be present.
    fn messages_before(&self, chat: &Chat, msg: &Message, limit: usize) -> Result<Vec<Message>> {
        if limit == 0 { bail!("Limit is zero!"); }
        let result = self.messages_before_impl(chat, msg, limit)?;
        assert!(result.len() <= limit);
        Ok(result)
    }

    fn messages_before_impl(&self, chat: &Chat, msg: &Message, limit: usize) -> Result<Vec<Message>>;

    /// Return N messages after the given one (exclusive). Message must be present.
    fn messages_after(&self, chat: &Chat, msg: &Message, limit: usize) -> Result<Vec<Message>> {
        if limit == 0 { bail!("Limit is zero!"); }
        let result = self.messages_after_impl(chat, msg, limit)?;
        assert!(result.len() <= limit);
        Ok(result)
    }

    fn messages_after_impl(&self, chat: &Chat, msg: &Message, limit: usize) -> Result<Vec<Message>>;

    /// Return N messages between the given ones (exclusive). Messages must be present.
    fn messages_between(&self, chat: &Chat, msg1: &Message, msg2: &Message) -> Result<Vec<Message>> {
        let result = self.messages_between_impl(chat, msg1, msg2)?;
        Ok(result)
    }

    fn messages_between_impl(&self, chat: &Chat, msg1: &Message, msg2: &Message) -> Result<Vec<Message>>;

    /// Count messages between the given ones (exclusive). Messages must be present.
    fn count_messages_between(&self, chat: &Chat, msg1: &Message, msg2: &Message) -> Result<usize>;

    /** Returns N messages before and N at-or-after the given date */
    fn messages_around_date(&self, chat: &Chat, date_ts: Timestamp, limit: usize) -> Result<(Vec<Message>, Vec<Message>)>;

    fn message_option(&self, chat: &Chat, source_id: MessageSourceId) -> Result<Option<Message>>;

    fn message_option_by_internal_id(&self, chat: &Chat, internal_id: MessageInternalId) -> Result<Option<Message>>;

    /** Whether given data path is the one loaded in this DAO */
    fn is_loaded(&self, storage_path: &Path) -> bool;
}