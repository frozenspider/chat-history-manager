use crate::prelude::*;

pub use chat_history_manager_dao::utils::test_utils::*;

use std::cell::RefCell;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub mod test_android {
    use super::*;

    pub fn create_databases(name: &str,
                            name_suffix: &str,
                            target_db_ext_suffix: &str,
                            db_filename: &str) -> (PathBuf, TmpDir) {
        super::create_databases(name, name_suffix, loader::android::DATABASES, target_db_ext_suffix, db_filename)
    }
}

pub struct NoopHttpClient;

impl HttpClient for NoopHttpClient {
    fn get_bytes(&self, url: &str) -> Result<HttpResponse> {
        log::info!("Mocking request to {}", url);
        Ok(HttpResponse::Ok(Vec::from(url.as_bytes())))
    }
}

pub struct MockHttpClient {
    pub calls: Arc<Mutex<RefCell<Vec<String>>>>,
}

impl Default for MockHttpClient {
    fn default() -> Self {
        Self::new()
    }
}

impl MockHttpClient {
    pub fn new() -> Self {
        MockHttpClient { calls: Arc::new(Mutex::new(RefCell::new(vec![]))) }
    }

    pub fn calls_copy(&self) -> Vec<String> {
        let lock = self.calls.lock().unwrap();
        let cell = &*lock;
        let vec: &Vec<String> = &cell.borrow();
        vec.clone()
    }
}

impl HttpClient for MockHttpClient {
    fn get_bytes(&self, url: &str) -> Result<HttpResponse> {
        log::info!("Mocking request to {}", url);
        let lock = self.calls.lock().unwrap();
        let cell = &*lock;
        cell.borrow_mut().push(url.to_owned());
        Ok(HttpResponse::Ok(Vec::from(url.as_bytes())))
    }
}
