use std::fs;

use tonic::Request;

use crate::protobuf::history::history_loader_service_server::*;

use super::*;

#[tonic::async_trait]
impl HistoryLoaderService for Arc<ChatHistoryManagerServer> {
    async fn load(&self, req: Request<LoadRequest>) -> TonicResult<LoadResponse> {
        self.process_request(&req, move |req| {
            let path = fs::canonicalize(&req.path)?;

            if let Some(dao) = read_or_status(&self.loaded_daos)?.get(&req.key) {
                let dao = read_or_status(dao)?;
                return Ok(LoadResponse { name: dao.name().to_owned() });
            }

            let dao = self.loader.load(&path, self.myself_chooser.as_ref())?;
            let response = LoadResponse { name: dao.name().to_owned() };
            write_or_status(&self.loaded_daos)?.insert(req.key.clone(), DaoRwLock::new(dao));
            Ok(response)
        })
    }

    async fn get_loaded_files(&self, req: Request<Empty>) -> TonicResult<GetLoadedFilesResponse> {
        self.process_request(&req, |_| {
            fn dao_to_loaded_file((k, dao): (&DaoKey, &DaoRwLock)) -> StatusResult<LoadedFile> {
                Ok(LoadedFile { key: k.clone(), name: read_or_status(dao)?.name().to_owned() })
            }
            let files: StatusResult<Vec<_>> = read_or_status(&self.loaded_daos)?.iter()
                .map(dao_to_loaded_file)
                .collect();
            Ok(GetLoadedFilesResponse { files: files? })
        })
    }

    async fn close(&self, req: Request<CloseRequest>) -> TonicResult<Empty> {
        self.process_request(&req, |req| {
            let dao = write_or_status(&self.loaded_daos)?.shift_remove(&req.key);
            if dao.is_none() {
                bail!("Database {} is not open!", req.key)
            }
            Ok(Empty {})
        })
    }

    async fn ensure_same(&self, req: Request<EnsureSameRequest>) -> TonicResult<EnsureSameResponse> {
        const MAX_DIFFS: usize = 10;

        self.process_request(&req, |req| {
            let loaded_daos = read_or_status(&self.loaded_daos)?;
            let master_dao = read_or_status(&loaded_daos[&req.master_dao_key])?;
            let slave_dao = read_or_status(&loaded_daos[&req.slave_dao_key])?;
            let diffs = dao::get_datasets_diff(
                (*master_dao).as_ref(), &req.master_ds_uuid,
                (*slave_dao).as_ref(), &req.slave_ds_uuid,
                MAX_DIFFS)?;
            Ok(EnsureSameResponse { diffs })
        })
    }
}
