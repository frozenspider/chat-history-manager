use super::*;
use crate::prelude::*;
use crate::history_dao_service_client::HistoryDaoServiceClient;
use crate::history_loader_service_client::HistoryLoaderServiceClient;
use crate::merge_service_client::MergeServiceClient;

use itertools::Itertools;
use std::fmt::Debug;
use std::future::Future;
use tokio::runtime::Handle;
use tonic::transport::{Channel, Endpoint};

mod user_input_grpc_requester;

pub async fn create_feedback_client(remote_port: u16) -> Result<Box<dyn FeedbackClientSync>> {
    let runtime_handle = Handle::current();
    let lazy_channel = Endpoint::new(format!("http://localhost:{remote_port}"))?.connect_lazy();
    Ok(Box::new(wrap_async_feedback_client(
        runtime_handle,
        user_input_grpc_requester::UserInputGrpcRequester {
            channel: lazy_channel,
        },
    )))
}

#[derive(Debug, Clone)]
pub struct ChatHistoryManagerGrpcClients {
    loader: HistoryLoaderServiceClient<Channel>,
    dao: HistoryDaoServiceClient<Channel>,
    merger: MergeServiceClient<Channel>,
}

impl ChatHistoryManagerGrpcClients {
    pub async fn grpc<'a, F, T>(
        &'a mut self,
        cb: impl FnOnce(
            &'a mut HistoryLoaderServiceClient<Channel>,
            &'a mut HistoryDaoServiceClient<Channel>,
            &'a mut MergeServiceClient<Channel>,
        ) -> F + 'a,
    ) -> Result<T>
        where F: Future<Output=StdResult<tonic::Response<T>, tonic::Status>>
    {
        match cb(&mut self.loader, &mut self.dao, &mut self.merger).await {
            Ok(response) => Ok(response.into_inner()),
            Err(status) => Err(anyhow!("{}", status.message()))
        }
    }
}

pub async fn create_clients(remote_port: u16) -> Result<ChatHistoryManagerGrpcClients> {
    let uri = format!("http://localhost:{remote_port}");
    log::info!("Connecting to clients at URI {uri}");
    let channel = Endpoint::new(uri)?.connect_lazy();
    let loader = HistoryLoaderServiceClient::new(channel.clone());
    let dao = HistoryDaoServiceClient::new(channel.clone());
    let merger = MergeServiceClient::new(channel);
    Ok(ChatHistoryManagerGrpcClients { loader, dao, merger })
}

pub async fn debug_request_myself(port: u16) -> Result<usize> {
    let conn_port = port + 1;
    let chooser = create_feedback_client(conn_port).await?;

    let ds_uuid = PbUuid { value: "00000000-0000-0000-0000-000000000000".to_owned() };
    let chosen = chooser.choose_myself(&[
        User {
            ds_uuid: ds_uuid.clone(),
            id: 100,
            first_name_option: Some("User 100 FN".to_owned()),
            last_name_option: None,
            username_option: None,
            phone_number_option: None,
            profile_pictures: vec![],
        },
        User {
            ds_uuid,
            id: 200,
            first_name_option: None,
            last_name_option: Some("User 200 LN".to_owned()),
            username_option: None,
            phone_number_option: None,
            profile_pictures: vec![],
        },
    ])?;
    Ok(chosen)
}


pub fn wrap_async_feedback_client<R>(handle: Handle, requester: R) -> impl FeedbackClientSync
where
    R: FeedbackClientAsync + Clone + Send + Sync + 'static,
{
    struct Wrapper<R> {
        handle: Handle,
        requester: R,
    }

    impl<R: FeedbackClientAsync> Wrapper<R> {
        fn ask_for_user_input<F, Out>(&self, logic: F) -> Result<Out>
        where
            F: Future<Output = Result<Out>> + Send + 'static,
            Out: Send + Debug + 'static,
        {
            let handle = self.handle.clone();
            // We cannot use the current thread since when called via RPC, current thread is already used for async tasks.
            std::thread::spawn(move || {
                let spawned = handle.spawn(logic);
                handle.block_on(spawned)?
            }).join().unwrap() // We're unwrapping join() to propagate panic.
        }
    }

    impl<R: FeedbackClientAsync + Clone + Send + Sync + 'static> FeedbackClientSync for Wrapper<R> {
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
