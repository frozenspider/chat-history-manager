pub mod loader;
mod utils;

use std::fmt::Debug;
use std::future::Future;

use prelude::*;

pub mod prelude {
    pub use std::collections::{HashMap, HashSet};
    pub use std::path::Path;

    pub use num_derive::*;

    #[cfg(test)]
    pub use crate::test_utils::*;
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

pub trait UserInputRequester: Send + Sync + 'static {
    fn choose_myself(&self, users: &[User]) -> impl Future<Output = Result<usize>> + Send;

    fn ask_for_text(&self, prompt: &str) -> impl Future<Output = Result<String>> + Send;
}

pub trait UserInputBlockingRequester: Send + Sync {
    fn choose_myself(&self, users: &[User]) -> Result<usize>;

    fn ask_for_text(&self, prompt: &str) -> Result<String>;
}
