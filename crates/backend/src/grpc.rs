pub mod server;
pub mod client;

use tonic::{Response, Status};
use chat_history_manager_core::utils::StdResult;

type StatusResult<T> = StdResult<T, Status>;
type TonicResult<T> = StatusResult<Response<T>>;
