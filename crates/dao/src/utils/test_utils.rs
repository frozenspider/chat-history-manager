use crate::in_memory_dao::InMemoryDao;
use crate::*;
use chat_history_manager_core::protobuf::history::*;
use chat_history_manager_core::utils::*;
use chat_history_manager_core::*;

pub use chat_history_manager_core::assert_matches;
pub use chat_history_manager_core::utils::test_utils::*;

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::*;
use itertools::Itertools;
use lazy_static::lazy_static;
use rand::Rng;
use rusqlite::{params, Connection};

lazy_static! {
    pub static ref MESSAGE_REGULAR_NO_CONTENT: message::Typed = message_regular! {
        edit_timestamp_option: None,
        is_deleted: false,
        forward_from_name_option: None,
        reply_to_message_id_option: None,
        contents: vec![],
    };
}

/// Creates a SQLite database from SQL files in the given directory.
/// For convenience, binary column values can be stored in separate binary files.
/// For binary files, the name should be in the format `"{db_name}__{table_name}__{condition}__{column_name}.bin"`.
pub fn create_sqlite_database(root_path: &Path,
                              databases_rel_path: &str,
                              target_db_ext_suffix: &str) -> TmpDir {
    let databases = root_path.join(databases_rel_path);
    if databases.exists() { fs::remove_dir_all(databases.clone()).unwrap(); }
    let db_tmp_dir = TmpDir::new_at(databases);

    let files = root_path.read_dir().unwrap()
        .map(|res| res.unwrap().path())
        .collect_vec();

    let sql_files =
        files.iter()
            .filter(|&child| path_file_name(child).unwrap().ends_with(".sql"))
            .collect_vec();

    for sql_file in sql_files.into_iter() {
        let db_name = path_file_name(sql_file).unwrap().smart_slice(..-4).to_owned();
        let target_db_path =
            db_tmp_dir.path.join(format!("{db_name}{target_db_ext_suffix}"));
        log::info!("Creating database {db_name}");
        let conn = Connection::open(target_db_path).unwrap();
        let sql = fs::read_to_string(sql_file).unwrap();
        conn.execute_batch(&sql).unwrap();
    }

    let binary_files =
        files.iter()
            .filter(|child| path_file_name(child).unwrap().ends_with(".bin"))
            .collect_vec();

    for bin_file in binary_files.into_iter() {
        let name = path_file_name(bin_file).unwrap();
        let (db_name, table_name, condition, column_name) =
            name.smart_slice(..-4).split("__").collect_tuple().unwrap();
        let (condition_key, condition_value) = condition.split('=').collect_tuple().unwrap();

        let target_db_path =
            db_tmp_dir.path.join(format!("{db_name}{target_db_ext_suffix}"));
        log::info!("Applying binary file {name}");
        let conn = Connection::open(target_db_path).unwrap();
        let content = fs::read(bin_file).unwrap();
        conn.execute(&format!("UPDATE {table_name} SET {column_name} = ?1 WHERE {condition_key} = ?2"),
                     params![content, condition_value]).unwrap();
    }

    db_tmp_dir
}

pub fn create_databases(resource_name: &str,
                        resource_name_suffix: &str,
                        databases_rel_path: &str,
                        target_db_ext_suffix: &str,
                        main_db_filename: &str) -> (PathBuf, TmpDir) {
    let folder = resource(&format!("{}_{}", resource_name, resource_name_suffix));
    assert!(folder.exists());

    let tmp_dir =
        create_sqlite_database(&folder, databases_rel_path, target_db_ext_suffix);

    (tmp_dir.path.join(main_db_filename), tmp_dir)
}

/// Returns paths to all files referenced by entities of this dataset. Some might not exist.
/// Files order matches the chats and messages order returned by DAO.
pub fn dataset_files(dao: &impl ChatHistoryDao, ds_uuid: &PbUuid) -> Vec<PathBuf> {
    let ds_root = dao.dataset_root(ds_uuid).unwrap();
    let cwds = dao.chats(ds_uuid).unwrap();
    let mut files: Vec<PathBuf> = cwds.iter()
        .filter_map(|cwd| cwd.chat.img_path_option.as_deref())
        .map(|f| ds_root.to_absolute(f)).collect();
    for cwd in cwds.iter() {
        let msgs = dao.first_messages(&cwd.chat, usize::MAX).unwrap();
        for msg in msgs.iter() {
            let more_files = msg.files(&ds_root);
            files.extend(more_files.into_iter());
        }
    }
    files
}

/// Checks that files were copied from source to destination.
pub fn assert_files(src_files: &[PathBuf], dst_files: &[PathBuf]) {
    assert_eq!(src_files.len(), dst_files.len());
    for (src, dst) in src_files.iter().zip(dst_files.iter()) {
        assert!(src.exists(), "File {} not found! Bug in test?", src.to_str().unwrap());
        assert!(dst.exists(), "File {} wasn't copied from source", dst.to_str().unwrap());
        let src_content = fs::read(src).unwrap();
        let dst_content = fs::read(dst).unwrap();
        let content_eq = src_content == dst_content;
        assert!(content_eq, "Content of {} didn't match its source {}", dst.to_str().unwrap(), src.to_str().unwrap());
    }
}

//
// Entity creation helpers
//

pub type MsgsMap<MsgType> = BTreeMap<MessageSourceId, MsgType>;

pub struct DaoEntities<MsgType> {
    pub dao_holder: InMemoryDaoHolder,
    pub ds: Dataset,
    pub ds_root: DatasetRoot,
    pub users: Vec<User>,
    pub cwd_option: Option<ChatWithDetails>,
    pub msgs: MsgsMap<MsgType>,
}

impl<MsgType> DaoEntities<MsgType> {
    pub fn cwd(&self) -> &ChatWithDetails { self.cwd_option.as_ref().unwrap() }
}

pub fn get_simple_dao_entities<MsgType>(
    dao_holder: InMemoryDaoHolder,
    wrap_message: fn(Message) -> MsgType,
) -> DaoEntities<MsgType> {
    let dao = dao_holder.dao.as_ref();
    let ds = dao.datasets().unwrap().remove(0);
    let ds_root = dao.dataset_root(&ds.uuid).unwrap();
    let users = dao.users(&ds.uuid).unwrap();
    let chat = dao.chats(&ds.uuid).unwrap();
    let cwd_option = if chat.is_empty() { None } else { Some(dao.chats(&ds.uuid).unwrap().remove(0)) };
    let msgs = match cwd_option {
        Some(ref cwd) => dao.first_messages(&cwd.chat, usize::MAX).unwrap(),
        None => vec![],
    };
    let duplicates = msgs.iter().map(|m| m.source_id()).counts().into_iter().filter(|pair| pair.1 > 1).collect_vec();
    assert!(duplicates.is_empty(), "Duplicate messages found! {:?}", duplicates);
    let msgs = msgs.into_iter().map(|m| (m.source_id(), wrap_message(m))).collect();
    DaoEntities { dao_holder, ds, ds_root, users, cwd_option, msgs }
}

pub fn create_simple_dao(
    is_master: bool,
    name_suffix: &str,
    messages: Vec<Message>,
    num_users: usize,
    amend_message: &impl Fn(bool, &DatasetRoot, &mut Message),
) -> InMemoryDaoHolder {
    let users = (1..=num_users).map(|i| create_user(&ZERO_PB_UUID, i as i64)).collect_vec();
    let member_ids = users.iter().map(|u| u.id).collect_vec();
    let chat = create_group_chat(&ZERO_PB_UUID, 1, "One", member_ids, messages.len());
    let cwms = vec![ChatWithMessages { chat, messages }];
    create_dao(name_suffix, users, cwms, |ds_root, m| amend_message(is_master, ds_root, m))
}

pub fn create_dao(
    name_suffix: &str,
    users: Vec<User> /* First one would be self. */,
    cwms: Vec<ChatWithMessages>,
    amend_messages: impl Fn(&DatasetRoot, &mut Message),
) -> InMemoryDaoHolder {
    assert!({
        let user_ids = users.iter().map(|u| u.id).collect_vec();
        cwms.iter()
            .flat_map(|cwm| cwm.messages.iter().map(|m| m.from_id))
            .all(|from_id| user_ids.contains(&from_id))
    }, "All messages should have valid user IDs!");

    let ds = Dataset {
        uuid: PbUuid::random(),
        alias: format!("Dataset {name_suffix}"),
    };

    let mut users = users;
    users.iter_mut().for_each(|u| u.ds_uuid = ds.uuid.clone());

    let tmp_dir = TmpDir::new();
    let ds_root = DatasetRoot(tmp_dir.path.clone());

    let mut cwms = cwms;
    for cwm in cwms.iter_mut() {
        cwm.chat.ds_uuid = ds.uuid.clone();
        let img = create_random_file(&ds_root.0);
        cwm.chat.img_path_option = Some(ds_root.to_relative(&img).unwrap());
        for m in cwm.messages.iter_mut() {
            amend_messages(&ds_root, m);
        }
    }
    let myself_id = users.first().unwrap().id();
    InMemoryDaoHolder {
        dao: Box::new(InMemoryDao::new_single(
            format!("Test Dao {name_suffix}"),
            ds,
            ds_root.0,
            myself_id,
            users,
            cwms,
        )),
        tmp_dir,
    }
}

pub fn create_user(ds_uuid: &PbUuid, id: i64) -> User {
    User {
        ds_uuid: ds_uuid.clone(),
        id,
        first_name_option: Some("User".to_owned()),
        last_name_option: Some(id.to_string()),
        username_option: Some(format!("user{id}")),
        phone_number_option: Some("xxx xx xx".replace("x", &id.to_string())),
        profile_pictures: vec![],
    }
}

pub fn create_personal_chat(ds_uuid: &PbUuid, idx: i32, user: &User, member_ids: Vec<i64>, msg_count: usize) -> Chat {
    assert!(member_ids.len() == 2);
    Chat {
        ds_uuid: ds_uuid.clone(),
        id: idx as i64,
        name_option: user.pretty_name_option(),
        source_type: SourceType::Telegram as i32,
        tpe: ChatType::Personal as i32,
        img_path_option: None,
        member_ids,
        msg_count: msg_count as i32,
        main_chat_id: None,
    }
}

pub fn create_group_chat(ds_uuid: &PbUuid, id: i64, name_suffix: &str, member_ids: Vec<i64>, msg_count: usize) -> Chat {
    assert!(member_ids.len() >= 2);
    Chat {
        ds_uuid: ds_uuid.clone(),
        id,
        name_option: Some(format!("Chat {}", name_suffix)),
        source_type: SourceType::Telegram as i32,
        tpe: ChatType::PrivateGroup as i32,
        img_path_option: None,
        member_ids,
        msg_count: msg_count as i32,
        main_chat_id: None,
    }
}

pub fn create_regular_message(idx: usize, user_id: usize) -> Message {
    let rng = rng();
    // Any previous message
    let reply_to_message_id_option =
        if idx > 0 { Some(rng.random_range(0..idx) as i64) } else { None };

    let typed = message_regular! {
        edit_timestamp_option: Some(
                (*BASE_DATE + Duration::try_minutes(idx as i64).unwrap() + Duration::try_seconds(5).unwrap()
            ).timestamp()),
        is_deleted: false,
        reply_to_message_id_option: reply_to_message_id_option,
        forward_from_name_option: Some(format!("u{user_id}")),
        contents: vec![
            content!(Poll { question: format!("Hey, {idx}!") })
        ],
    };

    let text = vec![RichText::make_plain(format!("Hello there, {idx}!"))];
    let searchable_string = make_searchable_string(&text, &typed);
    Message {
        internal_id: idx as i64 * 100,
        source_id_option: Some(idx as i64),
        timestamp: (*BASE_DATE + Duration::try_minutes(idx as i64).unwrap()).timestamp(),
        from_id: user_id as i64,
        text,
        searchable_string,
        typed: Some(typed),
    }
}

//
// Helper traits/impls
//

/// Since InMemoryDao is usually used to store just one dataset, test helpers are in order.
impl InMemoryDao {
    pub fn ds_uuid(&self) -> PbUuid {
        self.dataset().uuid.clone()
    }

    pub fn dataset(&self) -> Dataset {
        self.datasets().unwrap().first().unwrap().clone()
    }

    pub fn myself_single_ds(&self) -> User {
        self.myself(&self.ds_uuid()).unwrap()
    }

    pub fn users_single_ds(&self) -> Vec<User> {
        self.users(&self.ds_uuid()).unwrap()
    }

    pub fn cwms_single_ds(&self) -> Vec<ChatWithMessages> {
        self.cwms[&self.ds_uuid()].clone()
    }
}

pub struct InMemoryDaoHolder {
    pub dao: Box<InMemoryDao>,

    // We need to hold tmp_dir here to prevent early destruction.
    #[allow(unused)]
    pub tmp_dir: TmpDir,
}

pub trait MsgVec {
    fn cloned<const N: usize>(&self, src_ids: [MessageSourceId; N]) -> Self;
    fn changed(&self, condition: impl Fn(MessageSourceId) -> bool) -> Self;
}

impl MsgVec for Vec<Message> {
    fn cloned<const N: usize>(&self, src_ids: [MessageSourceId; N]) -> Self {
        self.iter().filter(|u| src_ids.contains(&u.source_id())).cloned().collect_vec()
    }

    fn changed(&self, condition: impl Fn(MessageSourceId) -> bool) -> Self {
        self.iter().cloned().map(|m| match m {
            Message { typed: Some(ref typed @ message::Typed::Regular(_)), .. } if condition(m.source_id()) => {
                let text = vec![RichText::make_plain(format!("Different message {}", *m.source_id()))];
                let searchable_string = make_searchable_string(&text, typed);
                Message { text, searchable_string, ..m }
            }
            m => m
        }).collect_vec()
    }
}
