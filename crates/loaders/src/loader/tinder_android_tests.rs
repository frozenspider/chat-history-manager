#![allow(unused_imports)]

use super::*;

use crate::entity_utils::*;
use chat_history_manager_core::protobuf::history::content::SealedValueOptional::*;
use chat_history_manager_core::protobuf::history::message::*;
use chat_history_manager_core::protobuf::history::message_service::SealedValueOptional::*;
use chat_history_manager_core::protobuf::history::User;

use std::fmt::format;
use std::fs;
use std::path::PathBuf;
use chrono::prelude::*;
use lazy_static::lazy_static;
use pretty_assertions::{assert_eq, assert_ne};

const RESOURCE_DIR: &str = "tinder-android";

//
// Tests
//

#[test]
fn loading_2023_11() -> EmptyRes {
    let http_client = MockHttpClient::new();
    let loader = TinderAndroidDataLoader { http_client: &http_client };
    let (res, db_dir) = test_android::create_databases(RESOURCE_DIR, "2023-11", ".db", DB_FILENAME);
    let _media_dir = TmpDir::new_at(db_dir.path.parent().unwrap().join(MEDIA_DIR));

    loader.looks_about_right(&res)?;
    let dao = loader.load(&res, &NoFeedbackClient)?;

    let ds_uuid = &dao.ds_uuid();
    let myself = dao.myself_single_ds();
    assert_eq!(myself, expected_myself(ds_uuid));

    let member = User {
        ds_uuid: ds_uuid.clone(),
        id: 780327027359649707_i64,
        first_name_option: Some("Abcde".to_owned()),
        last_name_option: None,
        username_option: None,
        phone_number_option: None,
        profile_pictures: vec![],
    };

    assert_eq!(dao.users_single_ds(), vec![myself.clone(), member.clone()]);

    assert_eq!(dao.cwms_single_ds().len(), 1);

    {
        let cwm = dao.cwms_single_ds().remove(0);
        let chat = cwm.chat;
        assert_eq!(chat, Chat {
            ds_uuid: ds_uuid.clone(),
            id: member.id,
            name_option: Some("Abcde".to_owned()),
            source_type: SourceType::TinderDb as i32,
            tpe: ChatType::Personal as i32,
            img_path_option: None,
            member_ids: vec![myself.id, member.id],
            msg_count: 2,
            main_chat_id: None,
        });

        let msgs = dao.first_messages(&chat, 99999)?;
        assert_eq!(msgs.len() as i32, chat.msg_count);

        assert_eq!(msgs[0], Message {
            internal_id: 0,
            source_id_option: Some(869569426176655274),
            timestamp: 1699812983,
            from_id: myself.id,
            text: vec![RichText::make_plain("Sending you a text!".to_owned())],
            searchable_string: "Sending you a text!".to_owned(),
            typed: Some(MESSAGE_REGULAR_NO_CONTENT.clone()),
        });
        assert_eq!(msgs[1], Message {
            internal_id: 1,
            source_id_option: Some(5405907581016140653),
            timestamp: 1699813000,
            from_id: member.id,
            text: vec![],
            searchable_string: "".to_owned(),
            typed: Some(message_regular! {
                edit_timestamp_option: None,
                is_deleted: false,
                forward_from_name_option: None,
                reply_to_message_id_option: None,
                contents: vec![
                    content!(Sticker {
                        path_option: Some(format!("{RELATIVE_MEDIA_DIR}/848013095925873688.gif")),
                        file_name_option: Some("848013095925873688.gif".to_owned()),
                        width: 542,
                        height: 558,
                        mime_type_option: None,
                        thumbnail_path_option: None,
                        emoji_option: None,
                    })
                ],
            }),
        });
    }

    assert_eq!(http_client.calls_copy(),
               vec!["https://media.tenor.com/mYFQztB4EHoAAAAC/house-hugh-laurie.gif?width=271&height=279"]);

    Ok(())
}

#[test]
fn loading_2024_07_photos() -> EmptyRes {
    let http_client = MockHttpClient::new();
    let loader = TinderAndroidDataLoader { http_client: &http_client };
    let (res, db_dir) = test_android::create_databases(RESOURCE_DIR, "2024-07_photos", ".db", DB_FILENAME);
    let _media_dir = TmpDir::new_at(db_dir.path.parent().unwrap().join(MEDIA_DIR));

    loader.looks_about_right(&res)?;
    let dao = loader.load(&res, &NoFeedbackClient)?;

    let ds_uuid = &dao.ds_uuid();
    let myself = dao.myself_single_ds();
    assert_eq!(myself, expected_myself(ds_uuid));

    let expected_profile_pic_names = [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
        "33333333-3333-3333-3333-333333333333",
        "44444444-4444-4444-4444-444444444444",
    ];

    let member = User {
        ds_uuid: ds_uuid.clone(),
        id: 780327027359649707_i64,
        first_name_option: Some("Abcde".to_owned()),
        last_name_option: None,
        username_option: None,
        phone_number_option: None,
        profile_pictures: expected_profile_pic_names.iter().map(|name| ProfilePicture {
            path: format!("Media/_downloaded/original_{name}.jpeg"),
            frame_option: None,
        }).collect(),
    };

    assert_eq!(dao.users_single_ds(), vec![myself.clone(), member.clone()]);

    assert_eq!(dao.cwms_single_ds().len(), 1);

    {
        let cwm = dao.cwms_single_ds().remove(0);
        let chat = cwm.chat;
        assert_eq!(chat, Chat {
            ds_uuid: ds_uuid.clone(),
            id: member.id,
            name_option: Some("Abcde".to_owned()),
            source_type: SourceType::TinderDb as i32,
            tpe: ChatType::Personal as i32,
            img_path_option: None,
            member_ids: vec![myself.id, member.id],
            msg_count: 1,
            main_chat_id: None,
        });

        let msgs = dao.first_messages(&chat, 99999)?;
        assert_eq!(msgs.len() as i32, chat.msg_count);

        assert_eq!(msgs[0], Message {
            internal_id: 0,
            source_id_option: Some(4530276082231591390),
            timestamp: 1699812983,
            from_id: myself.id,
            text: vec![RichText::make_plain("Sending you a text!".to_owned())],
            searchable_string: "Sending you a text!".to_owned(),
            typed: Some(MESSAGE_REGULAR_NO_CONTENT.clone()),
        });
    }

    assert_eq!(http_client.calls_copy(),
               expected_profile_pic_names.iter()
                   .map(|name| format!("https://images-ssl.gotinder.com/123456789ABCDEF000000000/original_{name}.jpeg"))
                   .collect_vec());

    Ok(())
}

//
// Helpers
//

fn expected_myself(ds_uuid: &PbUuid) -> User {
    User {
        ds_uuid: ds_uuid.clone(),
        id: 1_i64,
        first_name_option: Some("Me".to_owned()),
        last_name_option: None,
        username_option: None,
        phone_number_option: None,
        profile_pictures: vec![],
    }
}
