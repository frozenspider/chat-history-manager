use tonic::Request;

use crate::protobuf::history::user_input_service_server::*;

use super::*;

#[tonic::async_trait]
impl<R: UserInputRequester> UserInputService for Arc<UserInputServer<R>> {
    async fn choose_myself(
        &self,
        request: Request<ChooseMyselfRequest>,
    ) -> TonicResult<ChooseMyselfResponse> {
        self.process_request(request, move |self_clone, request| async move {
            // let users = request.users.iter().cloned().collect_vec();
            let res = self_clone
                .async_requester
                .choose_myself(&request.users)
                .await?;
            Ok(ChooseMyselfResponse {
                picked_option: res as i32,
            })
        })
        .await
    }

    async fn ask_for_text(
        &self,
        request: Request<TextInputRequest>,
    ) -> TonicResult<TextInputResponse> {
        self.process_request(request, move |self_clone, request| async move {
            let res = self_clone
                .async_requester
                .ask_for_text(&request.prompt)
                .await?;
            Ok(TextInputResponse {
                user_input: res,
            })
        })
        .await
    }
}
