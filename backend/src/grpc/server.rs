use std::fmt::Debug;
use std::net::SocketAddr;
use std::sync::{Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};
use std::sync::Arc;

use indexmap::IndexMap;
use tokio::runtime::Handle;
use tonic::{Code, Request, Response, Status, transport::Server};

use crate::dao::ChatHistoryDao;
use crate::loader::Loader;
use crate::prelude::*;
use crate::protobuf::history::history_dao_service_server::HistoryDaoServiceServer;
use crate::protobuf::history::history_loader_service_server::HistoryLoaderServiceServer;
use crate::protobuf::history::merge_service_server::MergeServiceServer;

use super::*;

use super::client::{self, UserInputRequester};

mod history_loader_service;
mod history_dao_service;
mod merge_service;

pub(crate) const FILE_DESCRIPTOR_SET: &[u8] =
    tonic::include_file_descriptor_set!("grpc_reflection_descriptor");

// Abosulte path to data source
type DaoKey = String;
type DaoRwLock = RwLock<Box<dyn ChatHistoryDao>>;

// Should be used wrapped as Arc<Self>
pub struct ChatHistoryManagerServer {
    tokio_handle: Handle,
    loader: Loader,
    user_input_requester: Box<dyn UserInputRequester>,
    loaded_daos: RwLock<IndexMap<DaoKey, DaoRwLock>>,
}

impl ChatHistoryManagerServer {
    pub fn new_wrapped(tokio_handle: Handle, loader: Loader, user_input_requester: Box<dyn UserInputRequester>) -> Arc<Self> {
        Arc::new(ChatHistoryManagerServer {
            tokio_handle,
            loader,
            user_input_requester,
            loaded_daos: RwLock::new(IndexMap::new()),
        })
    }
}

trait ChatHistoryManagerServerTrait: Sized {
    async fn process_request<Q, P, L>(&self, req: Request<Q>, blocking_logic: L) -> TonicResult<P>
        where Q: Debug + Send + 'static,
              P: Debug + Send + 'static,
              L: FnMut(Self, Q) -> Result<P> + Send + 'static;

    async fn process_request_with_dao<Q, P, L>(&self, req: Request<Q>, key: DaoKey, blocking_logic: L) -> TonicResult<P>
        where Q: Debug + Send + 'static,
              P: Debug + Send + 'static,
              L: FnMut(Self, Q, &dyn ChatHistoryDao) -> Result<P> + Send + 'static;

    async fn process_request_with_dao_mut<Q, P, L>(&self, req: Request<Q>, key: DaoKey, blocking_logic: L) -> TonicResult<P>
        where Q: Debug + Send + 'static,
              P: Debug + Send + 'static,
              L: FnMut(Self, Q, &mut dyn ChatHistoryDao) -> Result<P> + Send + 'static;
}

impl ChatHistoryManagerServerTrait for Arc<ChatHistoryManagerServer> {
    async fn process_request<Q, P, L>(&self, req: Request<Q>, mut blocking_logic: L) -> TonicResult<P>
        where Q: Debug + Send + 'static,
              P: Debug + Send + 'static,
              L: FnMut(Self, Q) -> Result<P> + Send + 'static {
        log::debug!(">>> Request:  {}", truncate_to(format!("{:?}", req.get_ref()), 150));
        let self_clone = self.clone();
        let response_result = self.tokio_handle
            .spawn_blocking(move || blocking_logic(self_clone, req.into_inner()))
            .await
            .map_err(|e| Status::new(Code::Internal, format!("Blocking task failed: {:?}", e)))?
            .map(Response::new);
        log::debug!("<<< Response: {}", truncate_to(format!("{:?}", response_result), 150));
        response_result.map_err(|err| {
            let status = err.downcast::<Status>()
                .unwrap_or_else(|err| Status::new(Code::Internal, error_message(&err)));
            eprintln!("Request failed! Error was:\n{:?}", status.message());
            status
        })
    }

    async fn process_request_with_dao<Q, P, L>(&self, req: Request<Q>, key: DaoKey, mut blocking_logic: L) -> TonicResult<P>
        where Q: Debug + Send + 'static,
              P: Debug + Send + 'static,
              L: FnMut(Self, Q, &dyn ChatHistoryDao) -> Result<P> + Send + 'static {
        self.process_request(
            req,
            move |self_clone, req| {
                let loaded_daos = read_or_status(&self_clone.loaded_daos)?;
                let dao = loaded_daos.get(&key)
                    .ok_or_else(|| anyhow!("Database with key {key} is not loaded!"))?;
                let dao = read_or_status(dao)?;
                let dao = dao.as_ref();
                blocking_logic(self_clone.clone(), req, dao)
            },
        ).await
    }

    async fn process_request_with_dao_mut<Q, P, L>(&self, req: Request<Q>, key: DaoKey, mut blocking_logic: L) -> TonicResult<P>
        where Q: Debug + Send + 'static,
              P: Debug + Send + 'static,
              L: FnMut(Self, Q, &mut dyn ChatHistoryDao) -> Result<P> + Send + 'static {
        self.process_request(
            req,
            move |self_clone, req| {
                let loaded_daos = read_or_status(&self_clone.loaded_daos)?;
                let dao = loaded_daos.get(&key)
                    .ok_or_else(|| anyhow!("Database with key {key} is not loaded!"))?;
                let mut dao = write_or_status(dao)?;
                let dao = dao.as_mut();
                blocking_logic(self_clone.clone(), req, dao)
            },
        ).await
    }
}

// https://betterprogramming.pub/building-a-grpc-server-with-rust-be2c52f0860e
pub async fn start_server(port: u16, loader: Loader) -> EmptyRes {
    let addr = format!("127.0.0.1:{port}").parse::<SocketAddr>().unwrap();

    let remote_port = port + 1;

    let handle = Handle::current();
    let user_input_requester = client::create_user_input_requester(remote_port).await?;
    let chm_server = ChatHistoryManagerServer::new_wrapped(handle, loader, user_input_requester);

    log::info!("Server listening on {}", addr);

    let reflection_service = tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(FILE_DESCRIPTOR_SET)
        .build()
        .unwrap();

    // We need to wrap services in tonic_web::enable to enable Cross-Origin Resource Sharing (CORS),
    // i.e. setting Access-Control-Allow-* response headers.
    // See https://github.com/hyperium/tonic/pull/1326
    Server::builder()
        .accept_http1(true)
        .add_service(tonic_web::enable(HistoryLoaderServiceServer::new(chm_server.clone())))
        .add_service(tonic_web::enable(HistoryDaoServiceServer::new(chm_server.clone())))
        .add_service(tonic_web::enable(MergeServiceServer::new(chm_server)))
        .add_service(reflection_service)
        .serve(addr)
        .await?;

    Ok(())
}

fn lock_or_status<T>(target: &Mutex<T>) -> StatusResult<MutexGuard<'_, T>> {
    target.lock().map_err(|_| Status::new(Code::Internal, "Mutex is poisoned!"))
}

fn read_or_status<T>(target: &RwLock<T>) -> StatusResult<RwLockReadGuard<'_, T>> {
    target.read().map_err(|_| Status::new(Code::Internal, "RwLock is poisoned!"))
}

fn write_or_status<T>(target: &RwLock<T>) -> StatusResult<RwLockWriteGuard<'_, T>> {
    target.write().map_err(|_| Status::new(Code::Internal, "RwLock is poisoned!"))
}
