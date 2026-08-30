#![allow(unused_imports)]

use chat_history_manager_backend::prelude::*;
use chat_history_manager_core::protobuf::history::message::*;
use chat_history_manager_core::protobuf::history::message_service::SealedValueOptional::*;
use chat_history_manager_dao::utils::test_utils::*;
use chat_history_manager_loaders::loader::*;
use chrono::prelude::*;
use pretty_assertions::{assert_eq, assert_ne};
use std::path::PathBuf;

#[test]
fn load_save() -> Result<()> {
    let res = resource("telegram_2026-08_1to1");
    TelegramDataLoader.looks_about_right(&res)?;

    const MYSELF_ID: UserId = UserId(1038366037);
    const SOMEONE_ID: UserId = UserId(927254926);

    fn validate_dao(dao: &dyn ChatHistoryDao, ds_uuid: &PbUuid, msg_internal_ids: &[i64]) -> Result<()> {
        let expected_myself = User {
            ds_uuid: ds_uuid.clone(),
            id: *MYSELF_ID,
            first_name_option: Some("Me".to_owned()),
            ..Default::default()
        };
        let someone = User {
            ds_uuid: ds_uuid.clone(),
            id: *SOMEONE_ID,
            first_name_option: Some("Someone".to_owned()),
            ..Default::default()
        };

        let myself = dao.myself(&ds_uuid)?;
        assert_eq!(myself, expected_myself);
        let users = dao.users(&ds_uuid)?;
        assert_eq!(users.len(), 2);
        assert_eq!(users.iter().collect_vec(), vec![&myself, &someone]);

        let chats = dao.chats(&ds_uuid)?;
        assert_eq!(chats.len(), 1);

        let chat = &chats[0];
        assert_eq!(chat.members.iter().collect_vec(), vec![&myself, &someone]);
        assert_eq!(chat.chat.member_ids, vec![*MYSELF_ID, *SOMEONE_ID]);
        let msgs = dao.first_messages(&chat.chat, 100)?;
        assert_eq!(msgs.len(), 2);

        assert_eq!(
            msgs[0],
            Message::new(
                msg_internal_ids[0],
                Some(4281),
                1787647437,
                SOMEONE_ID,
                vec![RichText::make_plain(format!("Hey there"))],
                MESSAGE_REGULAR_NO_CONTENT.clone(),
            )
        );
        assert_eq!(
            msgs[1],
            Message::new(
                msg_internal_ids[1],
                Some(4282),
                1787647458,
                MYSELF_ID,
                vec![RichText::make_plain(format!("Howdy!"))],
                MESSAGE_REGULAR_NO_CONTENT.clone(),
            )
        );
        Ok(())
    }

    let tg_dao = TelegramDataLoader.load(
        &PredefinedInputFeedbackClient {
            myself_id: Some(MYSELF_ID),
            text: None,
        },
        &res,
    )?;
    let ds_uuid = tg_dao.ds_uuid();

    validate_dao(tg_dao.as_ref(), &ds_uuid, &[0, 1])?;

    let daos = init_from(tg_dao, res, None);

    validate_dao(&daos.dst_dao, &ds_uuid, &[1, 2])?;

    Ok(())
}

//
// Helpers
//

fn init_from(
    src_dao: Box<InMemoryDao>,
    src_dir: PathBuf,
    src_dao_tmpdir: Option<TmpDir>,
) -> SrcDstDaos {
    let (dst_dao, dst_dao_tmpdir) = create_empty_sqlite_database();
    let src_dataset_uuids = src_dao
        .datasets()
        .unwrap()
        .into_iter()
        .map(|ds| ds.uuid)
        .collect_vec();
    dst_dao
        .copy_datasets_from(src_dao.as_ref(), &src_dataset_uuids)
        .unwrap();
    let ds_uuid = src_dao.datasets().unwrap()[0].uuid.clone();
    let src_ds_root = src_dao.dataset_root(&ds_uuid).unwrap();
    let dst_ds_root = dst_dao.dataset_root(&ds_uuid).unwrap();
    SrcDstDaos {
        src_dao,
        src_dir,
        src_dao_tmpdir,
        dst_dao,
        dst_dao_tmpdir,
        ds_uuid,
        src_ds_root,
        dst_ds_root,
    }
}
