use std::fs;

use tonic::Request;
use chat_history_manager_dao::{DatasetDiff, DatasetDiffValues};
use crate::protobuf::history::history_loader_service_server::*;

use super::*;

#[tonic::async_trait]
impl HistoryLoaderService for Arc<ChatHistoryManagerServer> {
    async fn load(&self, req: Request<LoadRequest>) -> TonicResult<LoadResponse> {
        self.process_request_blocking(req, move |self_clone, req| {
            let path = fs::canonicalize(&req.path)?;

            if let Some(dao) = read_or_status(&self_clone.loaded_daos)?.get(&req.key) {
                let dao = read_or_status(dao)?;
                return Ok(LoadResponse { name: dao.name().to_owned() });
            }

            let dao = self_clone.loader.load(&path, self_clone.feedback_client.as_ref())?;
            let response = LoadResponse { name: dao.name().to_owned() };
            write_or_status(&self_clone.loaded_daos)?.insert(req.key.clone(), DaoRwLock::new(dao));
            Ok(response)
        }).await
    }

    async fn get_loaded_files(&self, req: Request<Empty>) -> TonicResult<GetLoadedFilesResponse> {
        self.process_request_blocking(req, |self_clone, _| {
            fn dao_to_loaded_file((k, dao): (&DaoKey, &DaoRwLock)) -> StatusResult<LoadedFile> {
                let dao = read_or_status(dao)?;
                Ok(LoadedFile {
                    key: k.clone(),
                    name: dao.name().to_owned(),
                    storage_path: path_to_str(dao.storage_path()).expect("storage path").to_owned()
                })
            }
            let files: StatusResult<Vec<_>> = read_or_status(&self_clone.loaded_daos)?.iter()
                .map(dao_to_loaded_file)
                .collect();
            Ok(GetLoadedFilesResponse { files: files? })
        }).await
    }

    async fn close(&self, req: Request<CloseRequest>) -> TonicResult<Empty> {
        self.process_request_blocking(req, |self_clone, req| {
            let dao = write_or_status(&self_clone.loaded_daos)?.shift_remove(&req.key);
            if dao.is_none() {
                bail!("Database {} is not open!", req.key)
            }
            Ok(Empty {})
        }).await
    }

    async fn ensure_same(&self, req: Request<EnsureSameRequest>) -> TonicResult<EnsureSameResponse> {
        const MAX_DIFFS: usize = 10;

        self.process_request_blocking(req, |self_clone, req| {
            let loaded_daos = read_or_status(&self_clone.loaded_daos)?;
            let master_dao = read_or_status(&loaded_daos[&req.master_dao_key])?;
            let slave_dao = read_or_status(&loaded_daos[&req.slave_dao_key])?;
            let diffs = chat_history_manager_dao::get_datasets_diff(
                (*master_dao).as_ref(), &req.master_ds_uuid,
                (*slave_dao).as_ref(), &req.slave_ds_uuid,
                MAX_DIFFS)?;
            Ok(EnsureSameResponse { diffs: diffs.into_iter().map(|v| v.into()).collect() })
        }).await
    }
}

impl From<DatasetDiff> for Difference {
    fn from(value: DatasetDiff) -> Self {
        Difference { message: value.message, values: value.values.map(|v| v.into()) }
    }
}

impl From<DatasetDiffValues> for DifferenceValues {
    fn from(value: DatasetDiffValues) -> Self {
        DifferenceValues { old: value.old, new: value.new }
    }
}
