use std::cmp;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use deepsize::DeepSizeOf;

use crate::*;

use super::*;

#[cfg(test)]
#[path = "in_memory_dao_tests.rs"]
mod tests;

macro_rules! subtract_or_zero {
    ($idx:expr, $limit:expr) => { if $idx > $limit { $idx - $limit } else { 0 } };
}

#[derive(DeepSizeOf)]
pub struct InMemoryDao {
    pub name: String,
    pub dataset: Dataset,
    pub ds_root: PathBuf,
    pub myself: User,
    pub users: Vec<User>,
    pub cwms: Vec<ChatWithMessages>,
}

impl InMemoryDao {
    pub fn new(name: String,
               dataset: Dataset,
               ds_root: PathBuf,
               myself: User,
               users: Vec<User>,
               cwms: Vec<ChatWithMessages>) -> Self {
        let ds_root = ds_root.canonicalize().expect("Could not canonicalize dataset root");
        assert!(users.iter().any(|u| *u == myself));
        InMemoryDao { name, dataset, ds_root, myself, users, cwms }
    }

    fn chat_members(&self, chat: &Chat) -> Vec<User> {
        let me = self.myself.clone();
        let mut members = chat.member_ids.iter()
            .filter(|&id| *id != me.id)
            .map(|id| self.user_option(chat.ds_uuid(), *id)
                .unwrap()
                .unwrap_or_else(|| panic!("No member with id {id} found for chat {}", chat.qualified_name())))
            .sorted_by_key(|u| u.id)
            .collect_vec();
        members.insert(0, me);
        members
    }

    fn cwm_option(&self, id: i64) -> Option<&ChatWithMessages> {
        self.cwms.iter()
            .find(|cwm| cwm.chat.iter().any(|c| c.id == id))
    }

    fn messages_option(&self, chat_id: i64) -> Option<&Vec<Message>> {
        self.cwm_option(chat_id).map(|cwm| &cwm.messages)
    }

    fn cwm_to_cwd(&self, cwm: &ChatWithMessages) -> ChatWithDetails {
        ChatWithDetails {
            chat: cwm.chat.clone().unwrap(),
            last_msg_option: cwm.messages.last().cloned(),
            members: self.chat_members(cwm.chat.as_ref().unwrap()),
        }
    }
}

impl ChatHistoryDao for InMemoryDao {
    fn name(&self) -> &str {
        self.name.as_str()
    }

    fn storage_path(&self) -> &Path {
        &self.ds_root
    }

    fn datasets(&self) -> Result<Vec<Dataset>> {
        Ok(vec![self.dataset.clone()])
    }

    fn dataset_root(&self, _ds_uuid: &PbUuid) -> DatasetRoot {
        DatasetRoot(self.storage_path().to_owned())
    }

    fn dataset_files(&self, _ds_uuid: &PbUuid) -> Result<HashSet<PathBuf>> {
        /*
        val dsRoot       = datasetRoot(dsUuid)
        val cwds         = chats(dsUuid)
        val chatImgFiles = cwds.map(_.chat.imgPathOption.map(_.toFile(dsRoot))).yieldDefined.toSet
        val msgFiles = for {
          cwd <- cwds
          m   <- firstMessages(cwd.chat, Int.MaxValue)
        } yield m.files(dsRoot)
        chatImgFiles ++ msgFiles.toSet.flatten
        */
        todo!()
    }

    fn myself(&self, _ds_uuid: &PbUuid) -> Result<User> {
        Ok(self.myself.clone())
    }

    fn users(&self, _ds_uuid: &PbUuid) -> Result<Vec<User>> {
        let mut result =
            self.users.iter().filter(|&u| *u != self.myself).cloned().collect_vec();
        result.insert(0, self.myself.clone());
        Ok(result)
    }

    fn user_option(&self, _ds_uuid: &PbUuid, id: i64) -> Result<Option<User>> {
        Ok(self.users.iter().find(|u| u.id == id).cloned())
    }

    fn chats(&self, _ds_uuid: &PbUuid) -> Result<Vec<ChatWithDetails>> {
        Ok(self.cwms.iter()
            .map(|cwm| self.cwm_to_cwd(cwm))
            .sorted_by_key(|cwd| // Minus used to reverse order
                cwd.last_msg_option.as_ref().map(|m| -m.timestamp).unwrap_or(i64::MAX))
            .collect_vec())
    }

    fn chat_option(&self, _ds_uuid: &PbUuid, id: i64) -> Result<Option<ChatWithDetails>> {
        Ok(self.cwm_option(id)
            .map(|cwm| self.cwm_to_cwd(cwm)))
    }

    fn scroll_messages(&self, chat: &Chat, offset: usize, limit: usize) -> Result<Vec<Message>> {
        Ok(self.messages_option(chat.id)
            .map(|msgs| cutout(msgs, offset, offset + limit))
            .unwrap_or(vec![]))
    }

    fn last_messages(&self, chat: &Chat, limit: usize) -> Result<Vec<Message>> {
        Ok(self.messages_option(chat.id)
            .map(|msgs| {
                cutout(msgs, subtract_or_zero!(msgs.len(), limit), msgs.len()).to_vec()
            })
            .unwrap_or(vec![]))
    }

    fn messages_before_impl(&self, chat: &Chat, msg: &Message, limit: usize) -> Result<Vec<Message>> {
        let msgs = self.messages_option(chat.id).unwrap();
        let idx = msgs.iter().rposition(|m| m.internal_id == msg.internal_id);
        match idx {
            None => err!("Message not found!"),
            Some(idx) => {
                Ok(cutout(msgs, subtract_or_zero!(idx, limit), idx))
            }
        }
    }

    fn messages_after_impl(&self, chat: &Chat, msg: &Message, limit: usize) -> Result<Vec<Message>> {
        let msgs = self.messages_option(chat.id).unwrap();
        let idx = msgs.iter().position(|m| m.internal_id == msg.internal_id);
        match idx {
            None => err!("Message not found!"),
            Some(idx) => {
                let start = idx + 1;
                Ok(cutout(msgs, start, start + limit))
            }
        }
    }

    fn messages_between_impl(&self, chat: &Chat, msg1: &Message, msg2: &Message) -> Result<Vec<Message>> {
        let msgs = self.messages_option(chat.id).unwrap();
        let idx1 = msgs.iter().position(|m| m.internal_id == msg1.internal_id);
        let idx2 = msgs.iter().rposition(|m| m.internal_id == msg2.internal_id);
        match (idx1, idx2) {
            (None, _) => err!("Message 1 not found!"),
            (_, None) => err!("Message 2 not found!"),
            (Some(idx1), Some(idx2)) if idx1 == idx2 =>
                Ok(vec![]),
            (Some(idx1), Some(idx2)) => {
                assert!(idx1 < idx2);
                Ok(msgs[(idx1 + 1)..idx2].to_vec())
            }
        }
    }

    fn count_messages_between(&self, chat: &Chat, msg1: &Message, msg2: &Message) -> Result<usize> {
        assert!(msg1.internal_id <= msg2.internal_id);
        // Inefficient!
        let between = self.messages_between(chat, msg1, msg2)?;
        if between.is_empty() {
            Ok(0)
        } else {
            let mut size = between.len() as i32;
            if between.first().unwrap().internal_id == msg1.internal_id { size -= 1; }
            if between.last().unwrap().internal_id == msg2.internal_id { size -= 1; }
            Ok(cmp::max(size, 0) as usize)
        }
    }

    fn messages_around_date(&self, chat: &Chat, date_ts: Timestamp, limit: usize)
                            -> Result<(Vec<Message>, Vec<Message>)> {
        let messages = self.messages_option(chat.id).unwrap();
        let idx = messages.iter().position(|m| m.timestamp >= *date_ts);
        Ok(match idx {
            None => {
                // Not found
                (self.last_messages(chat, limit)?, vec![])
            }
            Some(idx) => {
                let (p1, p2) = messages.split_at(idx);
                (cutout(p1, subtract_or_zero!(p1.len(), limit), p1.len()),
                 cutout(p2, 0, limit))
            }
        })
    }

    fn message_option(&self, chat: &Chat, source_id: MessageSourceId) -> Result<Option<Message>> {
        Ok(self.messages_option(chat.id).unwrap()
            .iter().find(|m| m.source_id_option.iter().contains(&*source_id)).cloned())
    }

    fn message_option_by_internal_id(&self, chat: &Chat, internal_id: MessageInternalId) -> Result<Option<Message>> {
        Ok(self.messages_option(chat.id).unwrap()
            .iter().find(|m| m.internal_id == *internal_id).cloned())
    }

    fn is_loaded(&self, storage_path: &Path) -> bool {
        self.ds_root.as_path() == storage_path
    }
}

fn cutout<T: Clone>(slice: &[T], start_inc: usize, end_exc: usize) -> Vec<T> {
    fn sanitize<T>(idx: usize, slice: &[T]) -> usize {
        cmp::min(cmp::max(idx, 0), slice.len())
    }
    slice[sanitize(start_inc, slice)..sanitize(end_exc, slice)].to_vec()
}