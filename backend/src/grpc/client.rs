use tokio::runtime::Handle;
use tonic::transport::Endpoint;

use crate::prelude::*;

mod myself_chooser;

pub trait MyselfChooser: Send + Sync {
    fn choose_myself(&self, users: &[User]) -> Result<usize>;
}

pub async fn create_myself_chooser(remote_port: u16) -> Result<Box<dyn MyselfChooser>> {
    let runtime_handle = Handle::current();
    let lazy_channel = Endpoint::new(format!("http://localhost:{remote_port}"))?.connect_lazy();
    Ok(Box::new(myself_chooser::MyselfChooserImpl { runtime_handle, channel: lazy_channel }))
}

#[derive(Clone, Copy)]
pub struct NoChooser;

impl MyselfChooser for NoChooser {
    fn choose_myself(&self, _pretty_names: &[User]) -> Result<usize> {
        err!("No way to choose myself!")
    }
}

pub async fn debug_request_myself(port: u16) -> Result<usize> {
    let conn_port = port + 1;
    let chooser = create_myself_chooser(conn_port).await?;

    let ds_uuid = PbUuid { value: "00000000-0000-0000-0000-000000000000".to_owned() };
    let chosen = chooser.choose_myself(&[
        User {
            ds_uuid: ds_uuid.clone(),
            id: 100,
            first_name_option: Some("User 100 FN".to_owned()),
            last_name_option: None,
            username_option: None,
            phone_number_option: None,
        },
        User {
            ds_uuid,
            id: 200,
            first_name_option: None,
            last_name_option: Some("User 200 LN".to_owned()),
            username_option: None,
            phone_number_option: None,
        },
    ])?;
    Ok(chosen)
}
