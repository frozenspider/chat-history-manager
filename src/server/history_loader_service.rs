use std::sync::{Arc, Mutex};

use tonic::Request;

use crate::*;
use crate::protobuf::history::history_parser_service_server::*;
use crate::protobuf::history::history_loader_service_server::*;

use super::*;

#[tonic::async_trait]
impl HistoryParserService for Arc<Mutex<ChatHistoryManagerServer>> {
    async fn parse(&self, req: Request<ParseRequest>) -> TonicResult<ParseResponse> {
        self.process_request(&req, move |req, self_lock| {
            let path = Path::new(&req.path);
            let dao = self_lock.loader.parse(path)?;
            Ok(ParseResponse {
                ds: Some(dao.in_mem_dataset()),
                root_file: String::from(dao.ds_root.to_str().unwrap()),
                myself: Some(dao.in_mem_myself()),
                users: (dao.in_mem_users()),
                cwms: dao.cwms,
            })
        })
    }
}

#[tonic::async_trait]
impl HistoryLoaderService for Arc<Mutex<ChatHistoryManagerServer>> {
    async fn load(&self, req: Request<LoadRequest>) -> TonicResult<LoadResponse> {
        self.process_request(&req, move |req, self_lock| {
            let path = fs::canonicalize(&req.path)?;

            if let Some(dao) = self_lock.loaded_daos.get(&req.key) {
                let dao = dao.borrow();
                return Ok(LoadResponse { name: dao.name().to_owned() });
            }

            let dao = self_lock.loader.load(req.key.clone(), &path)?;
            let response = LoadResponse { name: dao.name().to_owned() };
            self_lock.loaded_daos.insert(req.key.clone(), RefCell::new(dao));
            Ok(response)
        })
    }

    async fn get_loaded_files(&self, req: Request<Empty>) -> TonicResult<GetLoadedFilesResponse> {
        self.process_request(&req, |_, self_lock| {
            let files = self_lock.loaded_daos.iter()
                .map(|(k, dao)| LoadedFile { key: k.clone(), name: dao.borrow().name().to_owned() })
                .collect_vec();
            Ok(GetLoadedFilesResponse { files })
        })
    }

    async fn close(&self, req: Request<CloseRequest>) -> TonicResult<CloseResponse> {
        self.process_request(&req, |req, self_lock| {
            let dao = self_lock.loaded_daos.remove(&req.key);
            Ok(CloseResponse { success: dao.is_some() })
        })
    }
}
