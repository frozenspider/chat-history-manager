pub mod loader;
mod utils;

use prelude::*;

use itertools::Itertools;
use std::fmt::Debug;
use std::future::Future;

pub mod prelude {
    pub use std::collections::{HashMap, HashSet};
    pub use std::path::Path;

    pub use num_derive::*;

    #[cfg(test)]
    pub use crate::utils::test_utils::*;
    pub use crate::utils::*;
    pub use crate::*;

    pub use chat_history_manager_core::content;
    pub use chat_history_manager_core::err;
    pub use chat_history_manager_core::message_regular;
    pub use chat_history_manager_core::message_regular_pat;
    pub use chat_history_manager_core::message_service;
    pub use chat_history_manager_core::message_service_pat;
    pub use chat_history_manager_core::message_service_pat_unreachable;
    pub use chat_history_manager_core::protobuf::history::*;
    pub use chat_history_manager_core::utils::entity_utils::*;
    pub use chat_history_manager_core::utils::*;

    pub use chat_history_manager_dao::in_memory_dao::InMemoryDao;
    pub use chat_history_manager_dao::sqlite_dao::SqliteDao;
    pub use chat_history_manager_dao::ChatHistoryDao;
    pub use chat_history_manager_dao::MutableChatHistoryDao;
}

//
// Other
//

pub enum HttpResponse {
    Ok(Vec<u8>),
    Failure {
        status: reqwest::StatusCode,
        headers: reqwest::header::HeaderMap,
        body: Vec<u8>,
    },
}

pub trait HttpClient: Send + Sync {
    fn get_bytes(&self, url: &str) -> Result<HttpResponse>;
}

pub trait FeedbackClientAsync: Send + Sync + 'static {
    fn choose_myself(&self, users: &[User]) -> impl Future<Output = Result<usize>> + Send;

    fn ask_for_text(&self, prompt: &str) -> impl Future<Output = Result<String>> + Send;
}

pub trait FeedbackClientSync: Send + Sync {
    fn choose_myself(&self, users: &[User]) -> Result<usize>;

    fn ask_for_text(&self, prompt: &str) -> Result<String>;
}

#[derive(Debug, Clone, Copy)]
pub struct NoFeedbackClient;

impl FeedbackClientSync for NoFeedbackClient {
    fn choose_myself(&self, _users: &[User]) -> Result<usize> {
        err!("No way to choose myself!")
    }

    fn ask_for_text(&self, _prompt: &str) -> Result<String> {
        err!("No way to ask user!")
    }
}

#[derive(Debug, Clone)]
pub struct PredefinedInputFeedbackClient {
    pub myself_id: Option<i64>,
    pub text: Option<String>,
}

impl FeedbackClientSync for PredefinedInputFeedbackClient {
    fn choose_myself(&self, users: &[User]) -> Result<usize> {
        let myself_id = self
            .myself_id
            .ok_or_else(|| anyhow!("No user ID provided!"))?;
        users
            .iter()
            .enumerate()
            .find(|(_, u)| u.id == myself_id)
            .map(|(idx, _)| idx)
            .ok_or_else(|| {
                anyhow!(
                    "User with ID {} not found! User IDs: {}",
                    myself_id,
                    users.iter().map(|u| u.id).join(", ")
                )
            })
    }

    fn ask_for_text(&self, _prompt: &str) -> Result<String> {
        self.text
            .clone()
            .ok_or_else(|| anyhow!("No text provided!"))
    }
}
