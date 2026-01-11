--
-- Schema
--
CREATE TABLE call_log (    _id                              INTEGER PRIMARY KEY AUTOINCREMENT,    jid_row_id                       INTEGER,    from_me                          INTEGER,    call_id                          TEXT,    transaction_id                   INTEGER,    timestamp                        INTEGER,    video_call                       INTEGER,    duration                         INTEGER,    call_result                      INTEGER,    bytes_transferred                INTEGER,    group_jid_row_id                 INTEGER NOT NULL DEFAULT 0,    is_joinable_group_call           INTEGER,    call_creator_device_jid_row_id   INTEGER NOT NULL DEFAULT 0, call_random_id TEXT, call_link_row_id INTEGER NOT NULL DEFAULT 0, is_dnd_mode_on INTEGER, call_type INTEGER, offer_silence_reason INTEGER, scheduled_id TEXT, telecom_uuid TEXT);
CREATE TABLE chat (_id INTEGER PRIMARY KEY AUTOINCREMENT,jid_row_id INTEGER UNIQUE,hidden INTEGER,subject TEXT,created_timestamp INTEGER,display_message_row_id INTEGER,last_message_row_id INTEGER,last_read_message_row_id INTEGER,last_read_receipt_sent_message_row_id INTEGER,last_important_message_row_id INTEGER,archived INTEGER,sort_timestamp INTEGER,mod_tag INTEGER,gen REAL,spam_detection INTEGER,unseen_earliest_message_received_time INTEGER,unseen_message_count INTEGER,unseen_missed_calls_count INTEGER,unseen_row_count INTEGER,plaintext_disabled INTEGER,vcard_ui_dismissed INTEGER,change_number_notified_message_row_id INTEGER,show_group_description INTEGER,ephemeral_expiration INTEGER,last_read_ephemeral_message_row_id INTEGER,ephemeral_setting_timestamp INTEGER, unseen_important_message_count INTEGER NOT NULL DEFAULT 0, ephemeral_disappearing_messages_initiator INTEGER, group_type INTEGER NOT NULL DEFAULT 0, last_message_reaction_row_id INTEGER, last_seen_message_reaction_row_id INTEGER, unseen_message_reaction_count INTEGER, growth_lock_level INTEGER, growth_lock_expiration_ts INTEGER, last_read_message_sort_id INTEGER, display_message_sort_id INTEGER, last_message_sort_id INTEGER, last_read_receipt_sent_message_sort_id INTEGER, has_new_community_admin_dialog_been_acknowledged INTEGER NOT NULL DEFAULT 0, history_sync_progress INTEGER, ephemeral_displayed_exemptions INTEGER, chat_lock INTEGER, unseen_comment_message_count INTEGER, chat_origin TEXT, participation_status INTEGER, account_jid_row_id INTEGER, chat_encryption_state INTEGER, group_member_count INTEGER, limited_sharing INTEGER, limited_sharing_setting_timestamp INTEGER, is_contact INTEGER);
CREATE TABLE jid (_id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, server TEXT NOT NULL, agent INTEGER, device INTEGER, type INTEGER, raw_string TEXT);
CREATE TABLE message (_id INTEGER PRIMARY KEY AUTOINCREMENT, chat_row_id INTEGER NOT NULL, from_me INTEGER NOT NULL, key_id TEXT NOT NULL, sender_jid_row_id INTEGER, status INTEGER, broadcast INTEGER, recipient_count INTEGER, participant_hash TEXT, origination_flags INTEGER, origin INTEGER, timestamp INTEGER, received_timestamp INTEGER, receipt_server_timestamp INTEGER, message_type INTEGER, text_data TEXT, starred INTEGER, lookup_tables INTEGER, sort_id INTEGER NOT NULL DEFAULT 0 , message_add_on_flags INTEGER, view_mode INTEGER, translated_text TEXT, view_replies_thread_id INTEGER);
CREATE TABLE message_edit_info (message_row_id INTEGER PRIMARY KEY, original_key_id TEXT NOT NULL, edited_timestamp INTEGER NOT NULL, sender_timestamp INTEGER NOT NULL);
CREATE TABLE message_forwarded(message_row_id INTEGER PRIMARY KEY, forward_score INTEGER, forward_origin INTEGER);
CREATE TABLE message_location (message_row_id INTEGER PRIMARY KEY, chat_row_id INTEGER, latitude REAL, longitude REAL, place_name TEXT, place_address TEXT, url TEXT, live_location_share_duration INTEGER, live_location_sequence_number INTEGER, live_location_final_latitude REAL, live_location_final_longitude REAL, live_location_final_timestamp INTEGER, map_download_status INTEGER);
CREATE TABLE message_media (  message_row_id INTEGER PRIMARY KEY, chat_row_id INTEGER, autotransfer_retry_enabled INTEGER, multicast_id TEXT, media_job_uuid TEXT, transferred INTEGER, transcoded INTEGER, file_path TEXT, file_size INTEGER, suspicious_content INTEGER, trim_from INTEGER, trim_to INTEGER, face_x INTEGER, face_y INTEGER, media_key BLOB, media_key_timestamp INTEGER, width INTEGER, height INTEGER, has_streaming_sidecar INTEGER, gif_attribution INTEGER, thumbnail_height_width_ratio REAL, direct_path TEXT, first_scan_sidecar BLOB, first_scan_length INTEGER, message_url TEXT, mime_type TEXT, file_length INTEGER, media_name TEXT, file_hash TEXT, media_duration INTEGER, page_count INTEGER, enc_file_hash TEXT, partial_media_hash TEXT, partial_media_enc_hash TEXT, is_animated_sticker INTEGER, original_file_hash TEXT, mute_video INTEGER DEFAULT 0, media_caption TEXT, media_upload_handle TEXT, sticker_flags INTEGER, raw_transcription_text TEXT, first_viewed_timestamp INTEGER, doodle_id TEXT, media_source_type INTEGER, accessibility_label TEXT, media_transcode_quality INTEGER DEFAULT 0, metadata_url TEXT, motion_photo_presentation_offset_ms INTEGER, qr_url TEXT);
CREATE TABLE message_quoted (    message_row_id             INTEGER PRIMARY KEY AUTOINCREMENT,    chat_row_id                INTEGER NOT NULL,    parent_message_chat_row_id INTEGER NOT NULL,    from_me                    INTEGER NOT NULL,    sender_jid_row_id          INTEGER,    key_id                     TEXT    NOT NULL,    timestamp                  INTEGER,    message_type               INTEGER,    origin                     INTEGER,    text_data                  TEXT,    payment_transaction_id     TEXT,    lookup_tables              INTEGER, quoted_source INTEGER, quoted_type INTEGER);
CREATE TABLE message_revoked (message_row_id INTEGER PRIMARY KEY, revoked_key_id TEXT NOT NULL, admin_jid_row_id INTEGER, revoke_timestamp INTEGER);
CREATE TABLE message_system (message_row_id INTEGER PRIMARY KEY, action_type INTEGER NOT NULL);
CREATE TABLE message_system_block_contact (message_row_id INTEGER PRIMARY KEY, is_blocked INTEGER);
CREATE TABLE message_system_chat_participant (message_row_id INTEGER, user_jid_row_id INTEGER);
CREATE TABLE message_system_group (message_row_id INTEGER PRIMARY KEY, is_me_joined INTEGER);
CREATE TABLE message_system_number_change (message_row_id INTEGER PRIMARY KEY, old_jid_row_id INTEGER, new_jid_row_id INTEGER);
CREATE TABLE message_ui_elements(_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, message_row_id INTEGER NOT NULL, element_type INTEGER, element_content TEXT);
CREATE TABLE message_vcard (_id  INTEGER PRIMARY KEY AUTOINCREMENT, message_row_id INTEGER, vcard TEXT);
CREATE TABLE props (_id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, value TEXT);

--
-- Data
--

-- Myself (#jid = 264)
INSERT INTO jid VALUES(264,'00000','s.whatsapp.net',0,0,0,'00000@s.whatsapp.net');
INSERT INTO props VALUES(48857,'user_push_name','Aaaaa Aaaaaaaaaaa');

-- User 1 (#jid = 252)
INSERT INTO jid VALUES(252,'11111','s.whatsapp.net',0,0,0,'11111@s.whatsapp.net');



-- Personal chat with user 1 (jid = #252)
INSERT INTO chat VALUES(148,252,0,NULL,1687705763841,7747,7747,7756,7756,1,1,1696244219000,NULL,NULL,1,0,0,0,0,1,0,1,0,86400,NULL,1696243309000,0,0,0,55,55,0,NULL,NULL,7756,7747,7747,7756,0,0,0,0,NULL,'general',NULL,932,2,NULL,NULL,NULL,NULL);

-- UI message (#msg = 11761)
INSERT INTO message VALUES(11761,148,0,'A79C32A482DF09EF37',0,0,0,0,NULL,8589934632,0,1761287123000,1761287125595,-1,85,NULL,0,0,11761,0,0,NULL,NULL);
INSERT INTO message_ui_elements VALUES(1,11761,6,'{"title":"","sub_title":"","description":"Line 1\nLine 2\n\nLine 3","templateId":"1078989761066675","hsmtag":"UTILITY","buttonText":"","selectListType":5,"sections":[],"native_flow_content":{"content_of_nfm":0,"message_params_json":"{\"bottom_sheet\":{\"in_thread_buttons_limit\":3,\"divider_indices\":[]}}","buttons":[{"name":"cta_url","params":"{\"display_text\":\"Doesn''t matter\",\"url\":\"https:\\\/\\\/w.meta.me\\\/s\\\/SOMETHING\",\"webview_presentation\":null,\"payment_link_preview\":false,\"landing_page_url\":\"https:\\\/\\\/t.me\\\/TELEGRAM_LINK\",\"webview_interaction\":false}","selected":false}],"is_carousel_card":false,"carousel_card_index":-1}}');
INSERT INTO message_location VALUES(11761,148,-8.7038565050269092182,115.21673666751774955,'New Bahari','Jl. Gurita No.21x, Denpasar, Bali',NULL,NULL,NULL,NULL,NULL,NULL,2);

--INSERT INTO message_location VALUES(11761,329,41.3291150000000016,69.3251810000000006,'Пункт выдачи Uzum Market','г. Ташкент, Мирзо Улугбекский район, улица Сайрам, дом 35',NULL,NULL,NULL,NULL,NULL,NULL,2);
