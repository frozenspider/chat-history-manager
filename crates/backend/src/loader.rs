use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use chrono::Local;
use itertools::{Either, Itertools};

use crate::prelude::*;
use crate::dao::ChatHistoryDao;
use crate::dao::sqlite_dao::SqliteDao;
use crate::loader::badoo_android::BadooAndroidDataLoader;
use crate::loader::mra::MailRuAgentDataLoader;
use crate::loader::signal::SignalDataLoader;
use crate::loader::telegram::TelegramDataLoader;
use crate::loader::tinder_android::TinderAndroidDataLoader;
use crate::loader::whatsapp_android::WhatsAppAndroidDataLoader;
use crate::loader::whatsapp_text::WhatsAppTextDataLoader;

mod telegram;
mod tinder_android;
mod whatsapp_android;
mod whatsapp_text;
mod signal;
mod badoo_android;
mod mra;

trait DataLoader: Send + Sync {
    fn name(&self) -> String;

    /// Used in dataset alias
    fn src_alias(&self) -> String {
        self.name()
    }

    // TODO: Add allowed files filter

    fn looks_about_right(&self, path: &Path) -> EmptyRes {
        ensure_file_presence(path)?;
        self.looks_about_right_inner(path)
    }

    fn looks_about_right_inner(&self, path: &Path) -> EmptyRes;

    fn load(&self, path: &Path, user_input_requester: &dyn UserInputBlockingRequester) -> Result<Box<InMemoryDao>> {
        let root_path_str = ensure_file_presence(path)?;
        measure(|| {
            let now_str = Local::now().format("%Y-%m-%d");
            let ds = Dataset {
                uuid: PbUuid::random(),
                alias: format!("{}, loaded @ {now_str}", self.src_alias()),
            };
            self.load_inner(path, ds, user_input_requester)
        }, |_, t| log::info!("File {} loaded in {t} ms", root_path_str))
    }

    fn load_inner(&self, path: &Path, ds: Dataset, user_input_requester: &dyn UserInputBlockingRequester) -> Result<Box<InMemoryDao>>;
}

pub struct Loader {
    loaders: Vec<Box<dyn DataLoader + 'static>>,
}

impl Loader {
    pub fn new<H: HttpClient>(http_client: &'static H) -> Self {
        Loader {
            loaders: vec![
                Box::new(TelegramDataLoader),
                Box::new(WhatsAppAndroidDataLoader),
                Box::new(WhatsAppTextDataLoader),
                Box::new(SignalDataLoader),
                Box::new(TinderAndroidDataLoader { http_client }),
                Box::new(BadooAndroidDataLoader),
                Box::new(MailRuAgentDataLoader),
            ],
        }
    }

    /// If the given file is an internal Sqlite DB, open it, otherwise attempt to parse a file as a foreign history.
    pub fn load(&self, path: &Path, user_input_requester: &dyn UserInputBlockingRequester) -> Result<Box<dyn ChatHistoryDao>> {
        let filename = path_file_name(path)?;
        if filename == SqliteDao::FILENAME {
            Ok(Box::new(SqliteDao::load(path)?))
        } else {
            Ok(self.parse(path, user_input_requester)?)
        }
    }

    /// Parses a history in a foreign format
    pub fn parse(&self, path: &Path, user_input_requester: &dyn UserInputBlockingRequester) -> Result<Box<InMemoryDao>> {
        ensure!(path.exists(), "File not found");
        let (named_errors, loads): (Vec<_>, Vec<_>) =
            self.loaders.iter()
                .partition_map(|loader| match loader.looks_about_right(path) {
                    Ok(()) => Either::Right(|| loader.load(path, user_input_requester)),
                    Err(why) => Either::Left((loader.name(), why)),
                });
        match loads.first() {
            Some(load) =>
                load(),
            None => {
                // Report why everyone rejected the file.
                err!("No loader accepted the file:\n{}",
                     named_errors.iter().map(|(name, why)| format!("{}: {}", name, why)).join("\n"))
            }
        }
    }
}

fn ensure_file_presence(root_file: &Path) -> Result<&str> {
    let root_file_str = path_to_str(root_file)?;
    if !root_file.exists() {
        bail!("File not found: {}", root_file_str)
    }
    Ok(root_file_str)
}

fn hash_to_id(str: &str) -> i64 {
    use std::hash::{BuildHasher, Hasher};
    let mut h = hasher().build_hasher();
    // Following write_str unstable implementation
    h.write(str.as_bytes());
    h.write_u8(0xff);
    (h.finish() / 2) as i64
}

fn first_line(path: &Path) -> Result<String> {
    let input = File::open(path)?;
    let buffered = BufReader::new(input);
    Ok(buffered.lines().next().context("File is empty")??.trim().to_owned())
}

// Android-specific helpers.
pub mod android {
    use const_format::concatcp;
    use rusqlite::Connection;

    use crate::loader::DataLoader;
    use crate::prelude::*;

    pub const DATABASES: &str = "databases";

    pub const MEDIA_DIR: &str = "Media";
    pub const MEDIA_DOWNLOADED_SUBDIR: &str = "_downloaded";

    pub const RELATIVE_MEDIA_DIR: &str = concatcp!(MEDIA_DIR, "/", MEDIA_DOWNLOADED_SUBDIR);

    /// Boilerplate for a data loader of salvaged Android sqlite database.
    /// First construct a custom users structure, use it to read chats, then normalize the structure into
    /// plain old Vec<User>.
    /// Produced users should have myself as a first user.
    pub trait AndroidDataLoader: Send + Sync {
        const NAME: &'static str;
        const DB_FILENAME: &'static str;

        type Users;

        fn tweak_conn(&self, _path: &Path, conn: &Connection) -> EmptyRes;

        fn parse_users(&self, conn: &Connection, ds_uuid: &PbUuid, path: &Path) -> Result<Self::Users>;

        fn normalize_users(&self, users: Self::Users, cwms: &[ChatWithMessages]) -> Result<Vec<User>>;

        fn parse_chats(&self, conn: &Connection, ds_uuid: &PbUuid, path: &Path, users: &mut Self::Users)
                       -> Result<Vec<ChatWithMessages>>;
    }

    impl<ADL> DataLoader for ADL
    where
        ADL: AndroidDataLoader,
    {
        fn name(&self) -> String { format!("{} (db)", ADL::NAME) }

        fn src_alias(&self) -> String { self.name() }

        fn looks_about_right_inner(&self, path: &Path) -> EmptyRes {
            let filename = path_file_name(path)?;
            if filename != ADL::DB_FILENAME { bail!("File is not {}", ADL::DB_FILENAME); }
            Ok(())
        }

        fn load_inner(&self, path: &Path, ds: Dataset, _user_input_requester: &dyn UserInputBlockingRequester) -> Result<Box<InMemoryDao>> {
            parse_android_db(self, path, ds)
        }
    }

    fn parse_android_db<ADL: AndroidDataLoader>(adl: &ADL, path: &Path, ds: Dataset) -> Result<Box<InMemoryDao>> {
        let path = path.parent().unwrap();

        let conn = Connection::open(path.join(ADL::DB_FILENAME))?;
        adl.tweak_conn(path, &conn)?;

        let path = if path_file_name(path)? == DATABASES {
            path.parent().unwrap()
        } else {
            path
        };

        let mut users = adl.parse_users(&conn, &ds.uuid, path)?;
        let cwms = adl.parse_chats(&conn, &ds.uuid, path, &mut users)?;

        let users = adl.normalize_users(users, &cwms)?;
        Ok(Box::new(InMemoryDao::new_single(
            format!("{} ({})", ADL::NAME, path_file_name(path)?),
            ds,
            path.to_path_buf(),
            users[0].id(),
            users,
            cwms,
        )))
    }
}
