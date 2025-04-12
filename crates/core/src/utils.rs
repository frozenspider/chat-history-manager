pub mod entity_utils;

// Unfortunately, #[cfg(test)] is not exported outside the crate, so we're using feature as a workaround
#[cfg(feature = "test-utils")]
pub mod test_utils;

use std::collections::{Bound, HashSet};
pub use std::error::Error as StdError;
use std::ffi::OsStr;
use std::fs::File;
use std::hash::{BuildHasher, BuildHasherDefault, Hasher as StdHasher};
use std::io;
use std::io::{BufReader, Read};
use std::ops::RangeBounds;
use std::path::{Path, PathBuf};
use std::time::Instant;

pub use anyhow::{anyhow, bail, ensure, Context};
use chrono::Local;
use hashers::fx_hash::FxHasher;
use itertools::Itertools;
use lazy_static::lazy_static;
use unicode_segmentation::UnicodeSegmentation;

//
// Constants
//
lazy_static! {
    pub static ref LOCAL_TZ: Local = Local::now().timezone();
}

//
// Error handling
//

pub type StdResult<T, E> = std::result::Result<T, E>;
pub type Result<T> = anyhow::Result<T>;
pub type EmptyRes = Result<()>;

/// To avoid specifying `Ok` type signature
#[inline(always)]
pub fn ok<T>(v: T) -> Result<T> { Ok(v) }

#[macro_export]
macro_rules! err {
    ($($arg:tt)*) => {{
        Err(anyhow!("{}", format!($($arg)*)))
    }}
}

/// Returns an error message with all the causes.
pub fn error_message(e: &anyhow::Error) -> String {
    format!("{:#}", e)
}

pub trait ToResult<T> {
    fn normalize_error(self) -> Result<T>;
}

impl<T> ToResult<T> for StdResult<T, Box<dyn StdError + Send + Sync>> {
    /// Unfortunately, anyhow::Error::from_boxed is private so we're losing information.
    fn normalize_error(self) -> Result<T> {
        self.map_err(|e| anyhow!("{}", e.as_ref()))
    }
}
//
// Smart slice
//

pub trait SmartSlice<'a> {
    type Sliced: 'a;

    const EMPTY_SLICE: Self::Sliced;

    /**
     * Works as `x[a..b]`, but understands negative indexes as those going from the other end,
     * -1 being the last element.
     * Allows indexing past either end, safely ignoring it.
     * If lower bound is past the end or (negative) upper bound is past the beginning, returns empty slice.
     */
    fn smart_slice<R: RangeBounds<i32>>(&'a self, range: R) -> Self::Sliced;
}

macro_rules! smart_slice_impl {
    () => {
        fn smart_slice<R: RangeBounds<i32>>(&'a self, range: R) -> Self::Sliced {
            let lower_inc: usize = match range.start_bound() {
                Bound::Included(&idx) if idx < 0 => {
                    let shift_from_end = -idx as usize;
                    if shift_from_end > self.len() {
                        0
                    } else {
                        self.len() - shift_from_end
                    }
                }
                Bound::Included(&idx) if idx as usize >= self.len() => return Self::EMPTY_SLICE,
                Bound::Included(&idx) => idx as usize,
                Bound::Unbounded => 0,
                Bound::Excluded(_) => unreachable!(),
            };
            let upper_inc: usize = match range.end_bound() {
                Bound::Included(&idx) if idx < 0 => {
                    let shift_from_end = -idx as usize;
                    if shift_from_end > self.len() {
                        return Self::EMPTY_SLICE;
                    }
                    self.len() - shift_from_end
                }
                Bound::Included(&idx) if idx as usize >= self.len() => self.len() - 1,
                Bound::Included(&idx) => idx as usize,
                Bound::Excluded(&idx) if idx < 0 => {
                    let shift_from_end = -idx as usize + 1;
                    if shift_from_end > self.len() {
                        return Self::EMPTY_SLICE;
                    }
                    self.len() - shift_from_end
                }
                Bound::Excluded(&idx) if idx as usize > self.len() => self.len() - 1,
                Bound::Excluded(&idx) => (idx - 1) as usize,
                Bound::Unbounded => self.len() - 1
            };
            if lower_inc > upper_inc {
                Self::EMPTY_SLICE
            } else {
                &self[lower_inc..=upper_inc]
            }
        }
    };
}

impl<'a, T: 'a> SmartSlice<'a> for [T] {
    type Sliced = &'a [T];
    const EMPTY_SLICE: Self::Sliced = &[];
    smart_slice_impl!();
}

impl<'a> SmartSlice<'a> for &str {
    type Sliced = &'a str;
    const EMPTY_SLICE: Self::Sliced = "";
    smart_slice_impl!();
}


//
// File system
//

/// 64 KiB
pub const FILE_BUF_CAPACITY: usize = 64 * 1024;

pub fn path_file_name(path: &Path) -> Result<&str> {
    path.file_name().and_then(|p: &OsStr| p.to_str()).context("Failed to convert filename to string")
}

/// Note: For use in logging and error messages, use `path.display()` instead
pub fn path_to_str(path: &Path) -> Result<&str> {
    path.to_str().context("Failed to convert path to a string")
}

/// List all files (not directories!) in the given path
pub fn list_all_files(p: &Path, recurse: bool) -> Result<Vec<PathBuf>> {
    let mut res = vec![];
    for entry in p.read_dir()? {
        let path = entry?.path();
        if path.is_file() {
            res.push(path);
        } else if recurse {
            res.extend(list_all_files(&path, recurse)?.into_iter());
        }
    }
    Ok(res)
}

/// Files are equal if their sizes and hashes are equal, or if they both don't exist
pub fn files_are_equal(f1: &Path, f2: &Path) -> Result<bool> {
    match (f1.metadata(), f2.metadata()) {
        (Err(_), Err(_)) => {
            // Both don't exist
            Ok(true)
        }
        (Ok(m1), Ok(m2)) => {
            // Check if file sizes are different
            if m1.len() != m2.len() {
                return Ok(false);
            }

            let hash1 = file_hash(f1)?;
            let hash2 = file_hash(f2)?;
            Ok(hash1 == hash2)
        },
        _ => Ok(false)
    }
}

//
// Time measurement
//

pub fn measure<T, AC, R>(block: T, after_call: AC) -> R
where
    T: FnOnce() -> R,
    AC: FnOnce(&R, u128),
{
    let start_time = Instant::now();
    let result = block();
    let elapsed = start_time.elapsed().as_millis();
    after_call(&result, elapsed);
    result
}

//
// Hashing
//

type HasherInner = FxHasher;

/// Non-cryptographic non-DDOS-safe fast hasher.
pub type Hasher = BuildHasherDefault<HasherInner>;

pub fn hasher() -> Hasher {
    BuildHasherDefault::<HasherInner>::default()
}

/// Get a hash of a file's content.
pub fn file_hash(path: &Path) -> StdResult<u128, io::Error> {
    let file = File::open(path)?;
    let mut reader = BufReader::with_capacity(FILE_BUF_CAPACITY, file);
    let mut buffer = [0; 512];

    // We use two hashers to produce a longer hash, thus reducing collision chance.
    let mut hashers = [hasher().build_hasher(), hasher().build_hasher()];

    for i in [0, 1].iter().cycle() /* Can't cycle over a mutable iterator */ {
        let count = reader.read(&mut buffer)?;
        if count == 0 { break; }
        hashers[*i].write(&buffer[..count]);
    }

    // Concatenate two hashes into u128
    let hash1 = hashers[0].finish();
    let hash2 = hashers[1].finish();
    Ok(((hash1 as u128) << 64) | (hash2 as u128))
}

/// Get a hash string (32 uppercase hex chars) of a file's content.
pub fn file_hash_string(path: &Path) -> StdResult<String, io::Error> {
    Ok(format!("{:X}", file_hash(path)?))
}

//
// Misc
//

pub fn truncate_to(str: String, max_len: usize) -> String {
    str.graphemes(true).take(max_len).collect::<String>()
}

pub fn transpose_option_result<T>(x: Option<Result<T>>) -> Result<Option<T>> {
    x.map_or(Ok(None), |v| v.map(Some))
}

pub fn transpose_option_std_result<T, E: StdError + Send + Sync + 'static>(x: Option<StdResult<T, E>>) -> Result<Option<T>> {
    x.map_or(Ok(None), |v| Ok(v.map(Some)?))
}

pub fn without_indices<T>(vec: Vec<T>, indices_to_remove: impl IntoIterator<Item=usize>) -> Vec<T> {
    let indices_to_remove: HashSet<_> = indices_to_remove.into_iter().collect();
    if indices_to_remove.is_empty() { return vec; }
    vec.into_iter()
        .enumerate()
        .filter(|(i, _)| !indices_to_remove.contains(i))
        .map(|(_, m)| m)
        .collect_vec()
}

