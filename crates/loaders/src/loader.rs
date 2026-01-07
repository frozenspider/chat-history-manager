mod telegram;
mod tg_keeper;
mod tinder_android;
mod whatsapp_android;
mod whatsapp_text;
mod signal;
mod badoo_android;
mod mra;

use std::borrow::Cow;
use std::fs::File;
use std::io::{BufRead, BufReader};

use chrono::Local;

use crate::prelude::*;

pub use crate::loader::badoo_android::BadooAndroidDataLoader;
pub use crate::loader::mra::MailRuAgentDataLoader;
pub use crate::loader::signal::SignalDataLoader;
pub use crate::loader::telegram::TelegramDataLoader;
pub use crate::loader::tg_keeper::TgKeeperDataLoader;
pub use crate::loader::tinder_android::TinderAndroidDataLoader;
pub use crate::loader::whatsapp_android::WhatsAppAndroidDataLoader;
pub use crate::loader::whatsapp_text::WhatsAppTextDataLoader;

pub trait DataLoader: Send + Sync {
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

    /// Check if the file looks like it could be loaded by this loader.
    /// Returns an error if the file is not supported.
    fn looks_about_right_inner(&self, path: &Path) -> EmptyRes;

    fn load(&self, path: &Path, feedback_client: &dyn FeedbackClientSync) -> Result<Box<InMemoryDao>> {
        let root_path_str = ensure_file_presence(path)?;
        measure(|| {
            let now_str = Local::now().format("%Y-%m-%d");
            let ds = Dataset {
                uuid: PbUuid::random(),
                alias: format!("{}, loaded @ {now_str}", self.src_alias()),
            };
            self.load_inner(path, ds, feedback_client)
        }, |_, t| log::info!("File {} loaded in {t} ms", root_path_str))
    }

    fn load_inner(&self, path: &Path, ds: Dataset, feedback_client: &dyn FeedbackClientSync) -> Result<Box<InMemoryDao>>;
}

/// A normalized phone number (digits only).
struct PhoneNumber(String);

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

fn normalize_rich_text(mut rtes: Vec<RichTextElement>) -> Vec<RichTextElement> {
    use rich_text_element::Val;

    // Concatenate consecutive plaintext elements
    let mut i = 0;
    while (i + 1) < rtes.len() {
        let el1 = &rtes[i];
        let el2 = &rtes[i + 1];
        if let (Some(Val::Plain(plain1)), Some(Val::Plain(plain2))) = (&el1.val, &el2.val) {
            let mut new_text = String::new();
            new_text.push_str(&plain1.text);
            new_text.push_str(&plain2.text);
            let new_plain = RichText::make_plain(new_text);
            rtes.splice(i..=(i + 1), vec![new_plain]);
        } else {
            i += 1;
        }
    }

    fn is_whitespaces(rte: &RichTextElement) -> bool {
        match rte.val.as_ref().unwrap() {
            Val::Plain(_) | Val::Bold(_) | Val::Italic(_) | Val::Underline(_) | Val::Strikethrough(_) |
            Val::Blockquote(_) | Val::Spoiler(_) => {
                rte.get_text().unwrap().chars().all(|c| c.is_whitespace())
            }
            Val::Link(_) | Val::PrefmtInline(_) | Val::PrefmtBlock(_) => {
                false
            }
        }
    }

    // Trim
    let first_idx = (0..rtes.len()).find(|&idx| !is_whitespaces(&rtes[idx]));
    if first_idx.is_none() { return vec![]; }
    let first_idx = first_idx.unwrap();
    if !matches!(rtes[first_idx].val, Some(Val::PrefmtInline(_) | Val::PrefmtBlock(_)))
        && let Some(text) = rtes[first_idx].get_text_mut()
    {
        *text = text.trim_start().to_owned();
    }

    let last_idx = (0..rtes.len()).rfind(|&idx| !is_whitespaces(&rtes[idx]));
    let last_idx = last_idx.unwrap();
    if !matches!(rtes[last_idx].val, Some(Val::PrefmtInline(_) | Val::PrefmtBlock(_)))
        && let Some(text) = rtes[last_idx].get_text_mut()
    {
        *text = text.trim_end().to_owned();
    }
    rtes[first_idx..=last_idx].to_vec()
}

/// Normalize phone number to E164 format if possible, otherwise strip all non-digit non-plus characters.
fn normalize_phone_number(s: &str) -> PhoneNumber {
    let mut pn = Cow::Borrowed(s);
    if pn.starts_with("00") {
        pn.to_mut().replace_range(0..2, "+");
    }
    match phonenumber::parse(None, &pn) {
        Ok(parsed) => {
            PhoneNumber(format!("{}", parsed.format().mode(phonenumber::Mode::E164)))
        }
        Err(_) => {
            log::warn!("Failed to parse phone number: {}", s);
            // Just strip all non-digit non-plus characters
            // Keep in sync with UserUpdatedEvent listener in UI
            PhoneNumber(pn.chars().filter(|c| c.is_ascii_digit() || *c == '+').collect())
        }
    }
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

        fn load_inner(&self, path: &Path, ds: Dataset, _feedback_client: &dyn FeedbackClientSync) -> Result<Box<InMemoryDao>> {
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
