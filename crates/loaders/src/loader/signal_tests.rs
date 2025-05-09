#![allow(unused_imports)]

use super::*;

use crate::entity_utils::*;
use chat_history_manager_core::protobuf::history::content::SealedValueOptional::*;
use chat_history_manager_core::protobuf::history::message::*;
use chat_history_manager_core::protobuf::history::message_service::SealedValueOptional::*;
use chat_history_manager_core::protobuf::history::User;
use chat_history_manager_dao::ChatHistoryDao;

use std::fs;
use aes::Aes256;
use cbc::cipher::BlockEncryptMut;
use cbc::Encryptor;
use pretty_assertions::{assert_eq, assert_ne};

const RESOURCE_DIR: &str = "signal";

//
// Tests
//

#[test]
fn loading_v7_27_macos_plaintext() -> EmptyRes {
    let loader = SignalDataLoader;
    let (res, db_dir) =
        create_databases(RESOURCE_DIR, "2024-08-macos", "sql", ".sqlite", PLAINTEXT_DB_FILENAME);
    let root_dir = db_dir.path.parent().unwrap();
    let _attachments_dir = TmpDir::new_at(root_dir.join(DECRYPTED_ATTACHMENTS_DIR_NAME));

    loader.looks_about_right(&res)?;
    let dao = loader.load(&res, &NoFeedbackClient)?;

    let ds_uuid = &dao.ds_uuid();
    let myself = dao.myself_single_ds();

    let member = User {
        ds_uuid: ds_uuid.clone(),
        id: 8531918205816895079,
        first_name_option: Some("Eeeee".to_owned()),
        last_name_option: Some("Eeeeeeeeee".to_owned()),
        username_option: None,
        phone_number_option: Some("+7 999 333 44 55".to_owned()),
        profile_pictures: vec![],
    };

    assert_eq!(dao.users_single_ds(), vec![expected_myself(ds_uuid), member.clone()]);

    assert_eq!(dao.cwms_single_ds().len(), 1);

    {
        let cwm = dao.cwms_single_ds().remove(0);
        let chat = cwm.chat;
        assert_eq!(chat, Chat {
            ds_uuid: ds_uuid.clone(),
            id: 7993589098607472366,
            name_option: Some("Eeeee".to_owned()),
            source_type: SourceType::Signal as i32,
            tpe: ChatType::Personal as i32,
            img_path_option: None,
            member_ids: vec![myself.id, member.id],
            msg_count: 5,
            main_chat_id: None,
        });

        let msgs = dao.first_messages(&chat, 99999)?;
        assert_eq!(msgs.len() as i32, chat.msg_count);

        assert_eq!(msgs[0], Message {
            internal_id: 0,
            source_id_option: Some(147338767122554438),
            timestamp: 1685967643,
            from_id: myself.id,
            text: vec![RichText::make_plain("Photo caption".to_owned())],
            searchable_string: "Photo caption".to_owned(),
            typed: Some(message_regular! {
                edit_timestamp_option: None,
                is_deleted: false,
                forward_from_name_option: None,
                reply_to_message_id_option: None,
                contents: vec![
                    content!(Photo {
                        path_option: Some(format!("{DECRYPTED_ATTACHMENTS_DIR_NAME}/ph/photo-698")),
                        width: 150,
                        height: 100,
                        mime_type_option: Some("image/jpeg".to_owned()),
                        is_one_time: false,
                    })
                ],
            }),
        });

        assert_eq!(msgs[1], Message {
            internal_id: 1,
            source_id_option: Some(7293848439858989906),
            timestamp: 1695224029,
            from_id: myself.id,
            text: vec![],
            searchable_string: "".to_owned(),
            typed: Some(message_service!(PhoneCall(MessageServicePhoneCall {
                duration_sec_option: None,
                discard_reason_option: Some("hangup".to_owned()),
                members: vec![]
            }))),
        });

        assert_eq!(msgs[2], Message {
            internal_id: 2,
            source_id_option: Some(1675761544200081935),
            timestamp: 1695792334,
            from_id: member.id,
            text: vec![],
            searchable_string: "".to_owned(),
            typed: Some(message_regular! {
                edit_timestamp_option: None,
                is_deleted: false,
                forward_from_name_option: None,
                reply_to_message_id_option: None,
                contents: vec![
                    content!(VoiceMsg {
                        path_option: None,
                        file_name_option: None,
                        mime_type: "audio/aac".to_owned(),
                        duration_sec_option: None,
                    })
                ],
            }),
        });

        assert_eq!(msgs[3], Message {
            internal_id: 3,
            source_id_option: Some(7443282593181227665),
            timestamp: 1696176322,
            from_id: member.id,
            text: vec![],
            searchable_string: "".to_owned(),
            typed: Some(message_regular! {
                edit_timestamp_option: None,
                is_deleted: false,
                forward_from_name_option: None,
                reply_to_message_id_option: None,
                contents: vec![
                    content!(Video {
                        path_option: Some(format!("{DECRYPTED_ATTACHMENTS_DIR_NAME}/vi/vid-6578-1")),
                        file_name_option: None,
                        title_option: None,
                        performer_option: None,
                        width: 400,
                        height: 800,
                        mime_type: "video/mp4".to_owned(),
                        duration_sec_option: None,
                        thumbnail_path_option: Some(format!("{DECRYPTED_ATTACHMENTS_DIR_NAME}/sc/screenshot-6578-1")),
                        is_one_time: false,
                    }),
                    content!(Video {
                        path_option: Some(format!("{DECRYPTED_ATTACHMENTS_DIR_NAME}/vi/vid-6578-2")),
                        file_name_option: None,
                        title_option: None,
                        performer_option: None,
                        width: 800,
                        height: 400,
                        mime_type: "video/mp4".to_owned(),
                        duration_sec_option: None,
                        thumbnail_path_option: Some(format!("{DECRYPTED_ATTACHMENTS_DIR_NAME}/sc/screenshot-6578-2")),
                        is_one_time: false,
                    })
                ],
            }),
        });

        assert_eq!(msgs[4], Message {
            internal_id: 4,
            source_id_option: Some(7080603443088336461),
            timestamp: 1696178282,
            from_id: myself.id,
            text: vec![RichText::make_plain("Edited message, final version".to_owned())],
            searchable_string: "Edited message, final version".to_owned(),
            typed: Some(message_regular! {
                edit_timestamp_option: Some(1696178321),
                ..Default::default()
            }),
        });
    }

    Ok(())
}

//
// Helpers
//

fn expected_myself(ds_uuid: &PbUuid) -> User {
    User {
        ds_uuid: ds_uuid.clone(),
        id: 3148627133722667954,
        first_name_option: Some("Aaaaa".to_owned()),
        last_name_option: Some("Aaaaaaaaaaa".to_owned()),
        username_option: None,
        phone_number_option: Some("+998 91 1234567".to_owned()),
        profile_pictures: vec![],
    }
}

/// Use this to encrypt test files:
/// ```rust
/// # use std::path::Path;
/// # fn wrapper() {
/// #   let root_dir: &Path = Path::new("path/to/your/root/dir");
///     encrypt_linked_file("my-rel-path", root_dir, "my-base64-key");
/// # }
///
/// ```
#[allow(dead_code)]
fn encrypt_linked_file(path: &str,
                       root_dir: &Path,
                       local_key_base64: &str) {
    use cipher::*;
    const IV: &[u8; AES_BLOCK_SIZE] = b"abcdefghijklmnop";

    const UNENCRYPTED_FILES_DIR: &str = "_unencrypted_files";
    let src_path = root_dir.join(UNENCRYPTED_FILES_DIR);
    let dst_path = root_dir.join(ATTACHMENTS_DIR_NAME);

    let full_src_path = src_path.join(path);
    assert!(full_src_path.exists());
    assert!(dst_path.is_dir());

    let full_dst_path = dst_path.join(path);
    assert!(!full_dst_path.exists());
    log::info!("Encrypting {path}");

    let src_data = fs::read(full_src_path).expect("Reading file");

    let key = BASE64_STANDARD.decode(local_key_base64).expect("Decoding key");
    assert_eq!(key.len(), CIPHER_KEY_SIZE + MAC_KEY_SIZE, "Invalid key length");

    let cipher_key = &key[..CIPHER_KEY_SIZE];
    let mac_key = &key[CIPHER_KEY_SIZE..];

    let src_data_len = src_data.len();
    let mut dst_data_len = src_data_len;

    // Pad file with trailing zeroes to the next AES block.
    // This is wrong but should be good enough for testing.
    if dst_data_len % AES_BLOCK_SIZE != 0 {
        dst_data_len += AES_BLOCK_SIZE - (dst_data_len % AES_BLOCK_SIZE);
    }
    let target_data_len = AES_BLOCK_SIZE + dst_data_len + SHA256_SIZE;
    let mut target_data = vec![0; target_data_len];
    target_data[..AES_BLOCK_SIZE].copy_from_slice(IV);
    let hmac = {
        let data = &mut target_data[AES_BLOCK_SIZE..(target_data_len - SHA256_SIZE)];
        assert_eq!(data.len() % AES_BLOCK_SIZE, 0, "Invalid attachment data length");

        let mut enc = Aes256CbcEncryptor::new_from_slices(cipher_key, IV)
            .expect("Invalid attachment key/IV length");

        for data in data.chunks_mut(AES_BLOCK_SIZE) {
            enc.encrypt_block_mut(Aes256CbcBlock::from_mut_slice(data));
        }

        let hmac = {
            let mut hmac = HmacSha256::new_from_slice(mac_key).expect("HMAC can take key of any size");
            hmac.update(IV);
            hmac.update(data);
            hmac.finalize()
        };
        hmac.into_bytes().to_vec()
    };
    target_data[target_data_len - SHA256_SIZE..].copy_from_slice(&hmac);

    fs::create_dir_all(full_dst_path.parent().unwrap()).expect("Creating parent dir");
    fs::write(full_dst_path, &target_data).expect("Writing encrypted file");
}

pub type Aes256CbcEncryptor = Encryptor<Aes256>;
