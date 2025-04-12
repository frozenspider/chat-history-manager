use tokio::runtime::Handle;

use prelude::*;

use crate::loader::Loader;

mod protobuf;
mod loader;
mod merge;
mod grpc;
mod utils;

pub use grpc::client::debug_request_myself;
pub use grpc::server::start_user_input_server;

pub mod prelude {
    pub use std::collections::{HashMap, HashSet};

    pub use num_derive::*;

    pub use crate::grpc::client;
    pub use crate::protobuf::history::*;
    #[cfg(test)]
    pub use crate::test_utils::*;
    pub use chat_history_manager_loaders::prelude::*;
    pub use chat_history_manager_core::utils::entity_utils::entity_equality::*;
}

//
// Entry points
//

pub fn parse_file(path: &str, user_input_requester: &dyn UserInputBlockingRequester) -> Result<Box<InMemoryDao>> {
    thread_local! {
        static LOADER: Loader = Loader::new(&ReqwestHttpClient);
    }
    LOADER.with(|loader| {
        loader.parse(Path::new(path), user_input_requester)
    })
}

pub async fn start_server(port: u16, remote_port: u16) -> EmptyRes {
    let loader = Loader::new(&ReqwestHttpClient);
    grpc::server::start_server(port, remote_port, loader).await
}

//
// Other
//

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
