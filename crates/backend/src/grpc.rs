use tonic::{Response, Status};
use crate::StdResult;

pub mod server;
pub mod client;

type StatusResult<T> = StdResult<T, Status>;
type TonicResult<T> = StatusResult<Response<T>>;
