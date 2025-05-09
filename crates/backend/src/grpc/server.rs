use std::fmt::Debug;
use std::future::Future;
use std::net::SocketAddr;
use std::sync::{Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};
use std::sync::Arc;

use indexmap::IndexMap;
use tokio::runtime::Handle;
use tonic::{Code, Request, Response, Status, transport::Server};

use crate::loader::Loader;
use crate::prelude::*;
use crate::protobuf::history::feedback_service_server::FeedbackServiceServer;
use crate::protobuf::history::history_dao_service_server::HistoryDaoServiceServer;
use crate::protobuf::history::history_loader_service_server::HistoryLoaderServiceServer;
use crate::protobuf::history::merge_service_server::MergeServiceServer;

use super::*;

use super::client;

mod history_loader_service;
mod history_dao_service;
mod merge_service;
mod user_info_service;

pub(crate) const FILE_DESCRIPTOR_SET: &[u8] =
    tonic::include_file_descriptor_set!("grpc_reflection_descriptor");

// Abosulte path to data source
type DaoKey = String;
type DaoRwLock = RwLock<Box<dyn ChatHistoryDao>>;

trait GeneralServerTrait
where
    Self: Sized + Send + Sync + 'static,
{
    fn get_tokio_handle(&self) -> &Handle;

    async fn process_request<Q, P, L, F>(self: &Arc<Self>, req: Request<Q>, mut logic: L) -> TonicResult<P>
    where
        Q: Debug + Send + 'static,
        P: Debug + Send + 'static,
        L: FnMut(Arc<Self>, Q) -> F,
        F: Future<Output = Result<P>>,
    {
        log::debug!(">>> Request:  {}", truncate_to(format!("{:?}", req.get_ref()), 150));
        let self_clone = Arc::clone(self);
        let response_result = logic(self_clone, req.into_inner())
            .await
            .map(Response::new);
        log::debug!("<<< Response: {}", truncate_to(format!("{:?}", response_result), 150));
        response_result.map_err(|err| {
            let status = err.downcast::<Status>()
                .unwrap_or_else(|err| Status::new(Code::Internal, error_message(&err)));
            eprintln!("Request failed! Error was:\n{:?}", status.message());
            status
        })
    }

    async fn process_request_blocking<Q, P, L>(self: &Arc<Self>, req: Request<Q>, mut blocking_logic: L) -> TonicResult<P>
    where
        Q: Debug + Send + 'static,
        P: Debug + Send + 'static,
        L: FnMut(Arc<Self>, Q) -> Result<P> + Send + 'static,
    {
        log::debug!(">>> Request:  {}", truncate_to(format!("{:?}", req.get_ref()), 150));
        let self_clone = Arc::clone(self);
        let response_result = self.get_tokio_handle()
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
}

// Should be used wrapped as Arc<Self>
struct ChatHistoryManagerServer {
    tokio_handle: Handle,
    loader: Loader,
    feedback_client: Box<dyn FeedbackClientSync>,
    loaded_daos: RwLock<IndexMap<DaoKey, DaoRwLock>>,
}

impl ChatHistoryManagerServer
where
    Self: GeneralServerTrait,
{
    pub fn new_wrapped(tokio_handle: Handle, loader: Loader, feedback_client: Box<dyn FeedbackClientSync>) -> Arc<Self> {
        Arc::new(ChatHistoryManagerServer {
            tokio_handle,
            loader,
            feedback_client,
            loaded_daos: RwLock::new(IndexMap::new()),
        })
    }

    async fn process_request_with_dao<Q, P, L>(self: &Arc<Self>, req: Request<Q>, key: DaoKey, mut blocking_logic: L) -> TonicResult<P>
        where Q: Debug + Send + 'static,
              P: Debug + Send + 'static,
              L: FnMut(Arc<Self>, Q, &dyn ChatHistoryDao) -> Result<P> + Send + 'static {
        self.process_request_blocking(
            req,
            move |self_clone, req| {
                let loaded_daos = read_or_status(&self_clone.loaded_daos)?;
                let dao = loaded_daos.get(&key)
                    .ok_or_else(|| anyhow!("Database with key {key} is not loaded!"))?;
                let dao = read_or_status(dao)?;
                let dao = dao.as_ref();
                blocking_logic(Arc::clone(&self_clone), req, dao)
            },
        ).await
    }

    async fn process_request_with_dao_mut<Q, P, L>(self: &Arc<Self>, req: Request<Q>, key: DaoKey, mut blocking_logic: L) -> TonicResult<P>
        where Q: Debug + Send + 'static,
              P: Debug + Send + 'static,
              L: FnMut(Arc<Self>, Q, &mut dyn ChatHistoryDao) -> Result<P> + Send + 'static {
        self.process_request_blocking(
            req,
            move |self_clone, req| {
                let loaded_daos = read_or_status(&self_clone.loaded_daos)?;
                let dao = loaded_daos.get(&key)
                    .ok_or_else(|| anyhow!("Database with key {key} is not loaded!"))?;
                let mut dao = write_or_status(dao)?;
                let dao = dao.as_mut();
                blocking_logic(Arc::clone(&self_clone), req, dao)
            },
        ).await
    }
}

impl GeneralServerTrait for ChatHistoryManagerServer {
    fn get_tokio_handle(&self) -> &Handle {
        &self.tokio_handle
    }
}

// Should be used wrapped as Arc<Self>
pub struct UserInputServer<R: FeedbackClientAsync> {
    tokio_handle: Handle,
    async_requester: R
}

impl<R: FeedbackClientAsync> UserInputServer<R> {
    pub fn new_wrapped(tokio_handle: Handle, async_requester: R) -> Arc<Self> {
        Arc::new(UserInputServer {
            tokio_handle,
            async_requester
        })
    }
}

impl<R: FeedbackClientAsync> GeneralServerTrait for UserInputServer<R> {
    fn get_tokio_handle(&self) -> &Handle {
        &self.tokio_handle
    }
}

// https://betterprogramming.pub/building-a-grpc-server-with-rust-be2c52f0860e
pub async fn start_server(port: u16, remote_port: u16, loader: Loader) -> EmptyRes {
    let addr = format!("127.0.0.1:{port}").parse::<SocketAddr>().unwrap();

    let handle = Handle::current();
    let feedback_client = client::create_feedback_client(remote_port).await?;
    let chm_server = ChatHistoryManagerServer::new_wrapped(handle, loader, feedback_client);

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
        .add_service(tonic_web::enable(HistoryLoaderServiceServer::new(Arc::clone(&chm_server))))
        .add_service(tonic_web::enable(HistoryDaoServiceServer::new(Arc::clone(&chm_server))))
        .add_service(tonic_web::enable(MergeServiceServer::new(chm_server)))
        .add_service(reflection_service)
        .serve(addr)
        .await?;

    Ok(())
}

pub async fn start_user_input_server<R: FeedbackClientAsync>(remote_port: u16, async_requester: R) -> EmptyRes {
    let addr = format!("127.0.0.1:{remote_port}").parse::<SocketAddr>().unwrap();

    let handle = Handle::current();
    let server = UserInputServer::new_wrapped(handle, async_requester);

    log::info!("User input server listening on {}", addr);

    let reflection_service = tonic_reflection::server::Builder::configure()
        .register_encoded_file_descriptor_set(FILE_DESCRIPTOR_SET)
        .build()
        .unwrap();

    // We need to wrap services in tonic_web::enable to enable Cross-Origin Resource Sharing (CORS),
    // i.e. setting Access-Control-Allow-* response headers.
    // See https://github.com/hyperium/tonic/pull/1326
    Server::builder()
        .accept_http1(true)
        .add_service(tonic_web::enable(FeedbackServiceServer::new(Arc::clone(&server))))
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
