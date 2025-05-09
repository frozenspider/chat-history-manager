use futures::future::BoxFuture;
use std::fmt::Debug;
use tonic::transport::Channel;

use crate::feedback_service_client::FeedbackServiceClient;

use super::*;

#[derive(Debug, Clone)]
pub struct UserInputGrpcRequester {
    pub channel: Channel,
}

impl UserInputGrpcRequester {
    async fn request_and_process<Response, Out, FnCreateReq, FnProcessRes>(
        &self, create_request: FnCreateReq, process_response: FnProcessRes,
    ) -> Result<Out>
    where
        FnCreateReq:
            for<'a> FnOnce(&'a mut FeedbackServiceClient<Channel>)
            -> BoxFuture<'a, TonicResult<Response>> + Send + 'static,
        FnProcessRes: FnOnce(Response) -> Result<Out> + Send + 'static,
        Response: Send + Debug + 'static,
        Out: Send + Debug + 'static,
    {
        let channel = self.channel.clone();

        // We cannot use the current thread since when called via RPC, current thread is already used for async tasks.
        let mut client = FeedbackServiceClient::new(channel);
        log::info!("Sending ChooseMyselfRequest");
        let response = create_request(&mut client)
            .await
            .map_err(|status| anyhow!("{}", status.message()))?;
        log::info!("Got response: {:?}", response);

        let response = response.into_inner();
        process_response(response)
    }
}

impl FeedbackClientAsync for UserInputGrpcRequester {
    async fn choose_myself(&self, users: &[User]) -> Result<usize> {
        let users = users.to_vec();
        let len = users.len();

        self.request_and_process(|client| {
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
        }).await
    }

    async fn ask_for_text(&self, prompt: &str) -> Result<String> {
        let prompt = prompt.to_owned();

        self.request_and_process(|client| {
            Box::pin(client.ask_for_text(TextInputRequest { prompt }))
        }, move |res| {
            Ok(res.user_input)
        }).await
    }
}
