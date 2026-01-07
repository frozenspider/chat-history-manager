use itertools::{Either, Itertools};

use crate::prelude::*;
use chat_history_manager_loaders::loader::*;

pub struct Loader {
    loaders: Vec<Box<dyn DataLoader + 'static>>,
}

impl Loader {
    pub fn new<H: HttpClient>(http_client: &'static H) -> Self {
        Loader {
            loaders: vec![
                Box::new(TelegramDataLoader),
                Box::new(TgKeeperDataLoader {
                    config: TgKeeperDataLoaderConfig {
                        load_generic_files: false,
                        max_file_video_size_bytes: 5 * 1024 * 1024, // 5 MB
                    }
                }),
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
    pub fn load(&self, path: &Path, feedback_client: &dyn FeedbackClientSync) -> Result<Box<dyn ChatHistoryDao>> {
        let filename = path_file_name(path)?;
        if filename == SqliteDao::FILENAME {
            Ok(Box::new(SqliteDao::load(path)?))
        } else {
            Ok(self.parse(path, feedback_client)?)
        }
    }

    /// Parses a history in a foreign format
    pub fn parse(&self, path: &Path, feedback_client: &dyn FeedbackClientSync) -> Result<Box<InMemoryDao>> {
        ensure!(path.exists(), "File not found");
        let (named_errors, loads): (Vec<_>, Vec<_>) =
            self.loaders.iter()
                .partition_map(|loader| match loader.looks_about_right(path) {
                    Ok(()) => Either::Right(|| loader.load(path, feedback_client)),
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
