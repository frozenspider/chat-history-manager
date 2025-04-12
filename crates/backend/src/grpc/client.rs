use itertools::Itertools;
use std::fmt::Debug;
use std::future::Future;
use tokio::runtime::Handle;
use tonic::transport::{Channel, Endpoint};

use super::*;
use crate::prelude::history_dao_service_client::HistoryDaoServiceClient;
use crate::prelude::history_loader_service_client::HistoryLoaderServiceClient;
use crate::prelude::merge_service_client::MergeServiceClient;
use crate::prelude::*;

mod user_input_grpc_requester;

pub async fn create_user_input_requester(remote_port: u16) -> Result<Box<dyn UserInputBlockingRequester>> {
    let runtime_handle = Handle::current();
    let lazy_channel = Endpoint::new(format!("http://localhost:{remote_port}"))?.connect_lazy();
    Ok(Box::new(wrap_async_user_input_requester(
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

#[derive(Clone, Copy)]
pub struct NoChooser;

impl UserInputBlockingRequester for NoChooser {
    fn choose_myself(&self, _users: &[User]) -> Result<usize> {
        err!("No way to choose myself!")
    }

    fn ask_for_text(&self, _prompt: &str) -> Result<String> {
        err!("No way to ask user!")
    }
}

#[derive(Clone)]
pub struct PredefinedInput {
    pub myself_id: Option<i64>,
    pub text: Option<String>,
}

impl UserInputBlockingRequester for PredefinedInput {
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

pub async fn debug_request_myself(port: u16) -> Result<usize> {
    let conn_port = port + 1;
    let chooser = create_user_input_requester(conn_port).await?;

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
                handle.block_on(spawned)?
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
