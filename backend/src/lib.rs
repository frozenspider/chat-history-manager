use std::path::Path;
use tokio::runtime::Handle;

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

pub struct ReqwestHttpClient;

impl HttpClient for ReqwestHttpClient {
    fn get_bytes(&self, url: &str) -> Result<HttpResponse> {
        let handle = Handle::current();
        let url = url.to_owned();
        let join_handle = handle.spawn(async move {
            let res = reqwest::get(&url).await?;
            let status = res.status();
            if status.is_success() {
                let body = res.bytes().await?.to_vec();
                Ok(HttpResponse::Ok(body))
            } else {
                let headers = res.headers().clone();
                let body = res.bytes().await?.to_vec();
                Ok(HttpResponse::Failure { status, headers, body })
            }
        });
        handle.block_on(join_handle)?
    }
}
