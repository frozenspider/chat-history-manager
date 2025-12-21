use crate::protobuf::history::*;
use crate::utils::entity_utils::*;

use std::cell::UnsafeCell;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::*;
use itertools::Itertools;
use lazy_static::lazy_static;
use rand::prelude::*;
use uuid::Uuid;

lazy_static! {
    pub static ref BASE_DATE: DateTime<FixedOffset> = dt("2019-01-02 11:15:21", None);

    pub static ref ZERO_UUID: Uuid = Uuid::parse_str("00000000-0000-0000-0000-000000000000").unwrap();

    pub static ref ZERO_PB_UUID: PbUuid = PbUuid { value: ZERO_UUID.to_string() };
}

thread_local! {
    static RNG: UnsafeCell<SmallRng> = UnsafeCell::new(SmallRng::from_os_rng());
}

#[macro_export]
macro_rules! coerce_enum {
    ($expr:expr, $pat:pat => $extracted_value:expr) => {{
        if let $pat = $expr {
            $extracted_value
        } else {
            panic!("Could not coerce {} to enum variant {}", stringify!($expr), stringify!($pat));
        }
    }};
}

/// Since [[std::assert_matches::assert_matches]] is unstable...
#[macro_export]
macro_rules! assert_matches {
    ($expr:expr, $pat:pat) => {{
        let value = $expr;
        assert!(matches!(value, $pat), "Expected value to match {}! Value:\n{:#?}",
                stringify!($pat), value);
    }};
    ($expr:expr, $pat:pat, $($arg:tt)*) => {{
        let value = $expr;
        assert!(matches!(value, $pat), "Expected value to match {}! Value:\n{:#?}\nContext: {}",
                stringify!($pat), value, format_args!($($arg)*));
    }};
}

pub fn resource(relative_path: &str) -> PathBuf {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap().replace("//", "/");
    Path::new(manifest_dir.as_str()).join("resources/test").join(relative_path)
}

pub fn rng() -> &'static mut SmallRng {
    let ptr = RNG.with(|rng: &UnsafeCell<SmallRng>| rng.get());
    unsafe { &mut *ptr }
}

pub fn dt(s: &str, offset: Option<&FixedOffset>) -> DateTime<FixedOffset> {
    let local = Local::now();
    let offset = offset.unwrap_or(local.offset());
    offset.from_local_datetime(&NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").unwrap()).unwrap()
}

pub fn random_alphanumeric(length: usize, seed: u64) -> String {
    let seed = {
        let mut bytes = [0u8; 32];
        bytes[..8].copy_from_slice(&seed.to_le_bytes());
        bytes
    };
    SmallRng::from_seed(seed)
        .sample_iter(&rand::distr::Alphanumeric)
        .take(length)
        .map(char::from)
        .collect()
}

pub fn create_named_file(path: &Path, content: &[u8]) {
    let mut file = fs::File::create(path).unwrap();
    file.write_all(content).unwrap();
}

pub fn create_random_named_file(path: &Path, seed: u64) {
    create_named_file(path, random_alphanumeric(256, seed).as_bytes())
}

pub fn create_random_file(parent: &Path, seed: u64) -> PathBuf {
    let path = parent.join(format!("{}.bin", random_alphanumeric(30, seed)));
    create_random_named_file(&path, seed);
    path
}

pub const fn src_id(id: i64) -> MessageSourceId { MessageSourceId(id) }

impl Message {
    pub fn source_id(&self) -> MessageSourceId { src_id(self.source_id_option.unwrap()) }
}

impl RichText {
    pub fn unwrap(rtes: &[RichTextElement]) -> Vec<&rich_text_element::Val> {
        rtes.iter().map(|rte| rte.val.as_ref().unwrap()).collect_vec()
    }

    pub fn unwrap_copy(rtes: &[RichTextElement]) -> Vec<rich_text_element::Val> {
        Self::unwrap(rtes).into_iter().cloned().collect_vec()
    }
}


#[must_use]
pub struct TmpDir {
    pub path: PathBuf,
}

impl Default for TmpDir {
    fn default() -> Self {
        Self::new()
    }
}

impl TmpDir {
    pub fn new() -> Self {
        let dir_name = format!("chm-rust_{}", random_alphanumeric(10, rng().random()));
        let path = std::env::temp_dir().canonicalize().unwrap().join(dir_name);
        Self::new_at(path)
    }

    pub fn new_at(full_path: PathBuf) -> Self {
        fs::create_dir(&full_path).unwrap_or_else(|_| panic!("Can't create temp directory '{}'!", full_path.display()));
        TmpDir { path: full_path }
    }
}

impl Drop for TmpDir {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.path).unwrap_or_else(|_| panic!("Failed to remove temporary dir '{}'", self.path.to_str().unwrap()))
    }
}

//
// Helper traits/impls
//

pub trait ExtOption<T> {
    fn unwrap_ref(&self) -> &T;
}

impl<T> ExtOption<T> for Option<T> {
    fn unwrap_ref(&self) -> &T { self.as_ref().unwrap() }
}
