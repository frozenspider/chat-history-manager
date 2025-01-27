use std::fmt::Debug;
use std::future::Future;
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
    pub use chat_history_manager_core::content;
    pub use chat_history_manager_core::utils::entity_utils::*;
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

pub async fn start_user_input_server<R: UserInputRequester>(remote_port: u16, async_requester: R) -> EmptyRes {
    grpc::server::start_user_input_server(remote_port, async_requester).await
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

pub trait UserInputRequester: Send + Sync + 'static {
    fn choose_myself(&self, users: &[User]) -> impl Future<Output = Result<usize>> + Send;

    fn ask_for_text(&self, prompt: &str) -> impl Future<Output = Result<String>> + Send;
}

pub trait UserInputBlockingRequester: Send + Sync {
    fn choose_myself(&self, users: &[User]) -> Result<usize>;

    fn ask_for_text(&self, prompt: &str) -> Result<String>;
}

pub fn wrap_async_user_input_requester<R>(handle: Handle, requester: R) -> impl UserInputBlockingRequester
where
    R: UserInputRequester + Clone + Send + Sync + 'static,
{
    struct Wrapper<R> {
        handle: Handle,
        requester: R,
    }

    impl<R: UserInputRequester> Wrapper<R> {
        fn ask_for_user_input<F, Out>(&self, logic: F) -> Result<Out>
        where
            F: Future<Output = Result<Out>> + Send + 'static,
            Out: Send + Debug + 'static,
        {
            let handle = self.handle.clone();
            // We cannot use the current thread since when called via RPC, current thread is already used for async tasks.
            std::thread::spawn(move || {
                let spawned = handle.spawn(logic);
                Ok(handle.block_on(spawned)??)
            }).join().unwrap() // We're unwrapping join() to propagate panic.
        }
    }

    impl<R: UserInputRequester + Clone + Send + Sync + 'static> UserInputBlockingRequester for Wrapper<R> {
        fn choose_myself(&self, users: &[User]) -> Result<usize> {
            let requester = self.requester.clone();
            let users = users.to_vec();
            self.ask_for_user_input(async move {
                requester.choose_myself(&users).await
            })
        }

        fn ask_for_text(&self, prompt: &str) -> Result<String> {
            let requester = self.requester.clone();
            let prompt = prompt.to_owned();
            self.ask_for_user_input(async move {
                requester.ask_for_text(&prompt).await
            })
        }
    }

    Wrapper { handle, requester }
}
