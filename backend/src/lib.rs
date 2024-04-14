use std::path::Path;

use prelude::*;

use crate::dao::in_memory_dao::InMemoryDao;
use crate::loader::Loader;

mod protobuf;
mod loader;
mod merge;
mod grpc;
mod dao;
mod utils;

pub mod prelude {
    pub use std::collections::{HashMap, HashSet};

    pub use num_derive::*;

    pub use crate::*;
    pub use crate::protobuf::history::*;
    pub use crate::grpc::client;
    #[cfg(test)]
    pub use crate::test_utils::*;
    pub use crate::utils::*;
    pub use crate::utils::entity_utils::*;
    pub use crate::utils::entity_utils::entity_equality::*;

    pub use chat_history_manager_core::message_regular;
    pub use chat_history_manager_core::message_regular_pat;
    pub use chat_history_manager_core::message_service;
    pub use chat_history_manager_core::message_service_pat;
    pub use chat_history_manager_core::message_service_pat_unreachable;
    pub use chat_history_manager_core::utils::entity_utils::*;
}

//
// Entry points
//

pub fn parse_file(path: &str, myself_chooser: &dyn grpc::client::MyselfChooser) -> Result<Box<InMemoryDao>> {
    thread_local! {
        static LOADER: Loader = Loader::new(&ReqwestHttpClient);
    }
    LOADER.with(|loader| {
        loader.parse(Path::new(path), myself_chooser)
    })
}

pub async fn start_server(port: u16) -> EmptyRes {
    let loader = Loader::new(&ReqwestHttpClient);
    grpc::server::start_server(port, loader).await
}

pub async fn debug_request_myself(port: u16) -> Result<usize> {
    grpc::client::debug_request_myself(port).await
}

//
// Other
//

pub trait HttpClient: Send + Sync {
    fn get_bytes(&self, url: &str) -> Result<Vec<u8>>;
}

pub struct ReqwestHttpClient;

impl HttpClient for ReqwestHttpClient {
    fn get_bytes(&self, url: &str) -> Result<Vec<u8>> {
        Ok(reqwest::blocking::get(url)?.bytes()?.to_vec())
    }
}
