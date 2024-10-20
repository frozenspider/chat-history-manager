use tokio::runtime::Handle;
use tonic::transport::Endpoint;

use crate::prelude::*;

use super::*;

mod user_input_requester;

pub trait UserInputRequester: Send + Sync {
    fn choose_myself(&self, users: &[User]) -> Result<usize>;

    fn ask_for_text(&self, prompt: &str) -> Result<String>;
}

pub async fn create_user_input_requester(remote_port: u16) -> Result<Box<dyn UserInputRequester>> {
    let runtime_handle = Handle::current();
    let lazy_channel = Endpoint::new(format!("http://localhost:{remote_port}"))?.connect_lazy();
    Ok(Box::new(user_input_requester::UserInputRequesterImpl { runtime_handle, channel: lazy_channel }))
}

#[derive(Clone, Copy)]
pub struct NoChooser;

impl UserInputRequester for NoChooser {
    fn choose_myself(&self, _pretty_names: &[User]) -> Result<usize> {
        err!("No way to choose myself!")
    }

    fn ask_for_text(&self, _prompt: &str) -> Result<String> {
        err!("No way to ask user!")
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
