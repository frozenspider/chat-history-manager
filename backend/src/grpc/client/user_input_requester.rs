use futures::future::BoxFuture;
use std::fmt::Debug;
use tokio::runtime::Handle;
use tonic::transport::Channel;

use crate::user_input_service_client::UserInputServiceClient;

use super::*;

pub struct UserInputRequesterImpl {
    pub runtime_handle: Handle,
    pub channel: Channel,
}

impl UserInputRequesterImpl {
    fn ask_for_user_input<Response, Out, FnCreateReq, FnProcessRes>(
        &self, create_request: FnCreateReq, process_response: FnProcessRes,
    ) -> Result<Out>
    where
        FnCreateReq:
            for<'a> FnOnce(&'a mut UserInputServiceClient<Channel>)
            -> BoxFuture<'a, TonicResult<Response>> + Send + 'static,
        FnProcessRes: FnOnce(Response) -> Result<Out> + Send + 'static,
        Response: Send + Debug + 'static,
        Out: Send + Debug + 'static,
    {
        let handle = self.runtime_handle.clone();
        let channel = self.channel.clone();

        // We cannot use the current thread since when called via RPC, current thread is already used for async tasks.
        std::thread::spawn(move || {
            let future = async move {
                let mut client = UserInputServiceClient::new(channel);
                log::info!("Sending ChooseMyselfRequest");
                create_request(&mut client)
                    .await
                    .map_err(|status| anyhow!("{}", status.message()))
            };

            let spawned = handle.spawn(future);
            let response = handle.block_on(spawned)?;
            log::info!("Got response: {:?}", response);

            let response = response?.into_inner();
            process_response(response)
        }).join().unwrap() // We're unwrapping join() to propagate panic.
    }
}

impl UserInputRequester for UserInputRequesterImpl {
    fn choose_myself(&self, users: &[User]) -> Result<usize> {
        let users = users.to_vec();
        let len = users.len();

        self.ask_for_user_input(|client| {
            Box::pin(client.choose_myself(ChooseMyselfRequest { users }))
        }, move |res| {
            let res = res.picked_option;
            if res < 0 {
                err!("Choice aborted!")
            } else if res as usize >= len {
                err!("Choice out of range!")
            } else {
                Ok(res as usize)
            }
        })
    }

    fn ask_for_text(&self, prompt: &str) -> Result<String> {
        let prompt = prompt.to_owned();

        self.ask_for_user_input(|client| {
            Box::pin(client.ask_for_text(TextInputRequest { prompt }))
        }, move |res| {
            Ok(res.user_input)
        })
    }
}
