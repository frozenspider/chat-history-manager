--
-- Schema
--
CREATE TABLE call_log (
    _id                            INTEGER PRIMARY KEY AUTOINCREMENT,
    jid_row_id                     INTEGER,
    from_me                        INTEGER,
    call_id                        TEXT,
    transaction_id                 INTEGER,
    timestamp                      INTEGER,
    video_call                     INTEGER,
    duration                       INTEGER,
    call_result                    INTEGER,
    bytes_transferred              INTEGER,
    group_jid_row_id               INTEGER NOT NULL DEFAULT 0,
    is_joinable_group_call         INTEGER,
    call_creator_device_jid_row_id INTEGER NOT NULL DEFAULT 0,
    call_random_id                 TEXT,
    call_link_row_id               INTEGER NOT NULL DEFAULT 0,
    is_dnd_mode_on                 INTEGER,
    call_type                      INTEGER,
    offer_silence_reason           INTEGER,
    scheduled_id                   TEXT,
    telecom_uuid                   TEXT,
    terminated_by_device_switch    INTEGER
);
CREATE TABLE chat (
    _id                                              INTEGER PRIMARY KEY AUTOINCREMENT,
    jid_row_id                                       INTEGER UNIQUE,
    hidden                                           INTEGER,
    subject                                          TEXT,
    created_timestamp                                INTEGER,
    display_message_row_id                           INTEGER,
    last_message_row_id                              INTEGER,
    last_read_message_row_id                         INTEGER,
    last_read_receipt_sent_message_row_id            INTEGER,
    last_important_message_row_id                    INTEGER,
    archived                                         INTEGER,
    sort_timestamp                                   INTEGER,
    mod_tag                                          INTEGER,
    gen                                              REAL,
    spam_detection                                   INTEGER,
    unseen_earliest_message_received_time            INTEGER,
    unseen_message_count                             INTEGER,
    unseen_missed_calls_count                        INTEGER,
    unseen_row_count                                 INTEGER,
    plaintext_disabled                               INTEGER,
    vcard_ui_dismissed                               INTEGER,
    change_number_notified_message_row_id            INTEGER,
    show_group_description                           INTEGER,
    ephemeral_expiration                             INTEGER,
    last_read_ephemeral_message_row_id               INTEGER,
    ephemeral_setting_timestamp                      INTEGER,
    unseen_important_message_count                   INTEGER NOT NULL DEFAULT 0,
    ephemeral_disappearing_messages_initiator        INTEGER,
    group_type                                       INTEGER NOT NULL DEFAULT 0,
    last_message_reaction_row_id                     INTEGER,
    last_seen_message_reaction_row_id                INTEGER,
    unseen_message_reaction_count                    INTEGER,
    growth_lock_level                                INTEGER,
    growth_lock_expiration_ts                        INTEGER,
    last_read_message_sort_id                        INTEGER,
    display_message_sort_id                          INTEGER,
    last_message_sort_id                             INTEGER,
    last_read_receipt_sent_message_sort_id           INTEGER,
    has_new_community_admin_dialog_been_acknowledged INTEGER NOT NULL DEFAULT 0,
    history_sync_progress                            INTEGER,
    ephemeral_displayed_exemptions                   INTEGER,
    chat_lock                                        INTEGER,
    unseen_comment_message_count                     INTEGER,
    chat_origin                                      TEXT,
    participation_status                             INTEGER,
    account_jid_row_id                               INTEGER,
    chat_encryption_state                            INTEGER,
    group_member_count                               INTEGER,
    limited_sharing                                  INTEGER,
    limited_sharing_setting_timestamp                INTEGER,
    is_contact                                       INTEGER,
    ephemeral_after_read_duration                    INTEGER,
    business_chat_state                              INTEGER
);
CREATE TABLE jid (
    _id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user       TEXT NOT NULL,
    server     TEXT NOT NULL,
    agent      INTEGER,
    device     INTEGER,
    type       INTEGER,
    raw_string TEXT
);
CREATE TABLE message (
    _id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_row_id              INTEGER NOT NULL,
    from_me                  INTEGER NOT NULL,
    key_id                   TEXT    NOT NULL,
    sender_jid_row_id        INTEGER,
    status                   INTEGER,
    broadcast                INTEGER,
    recipient_count          INTEGER,
    participant_hash         TEXT,
    origination_flags        INTEGER,
    origin                   INTEGER,
    timestamp                INTEGER,
    received_timestamp       INTEGER,
    receipt_server_timestamp INTEGER,
    message_type             INTEGER,
    text_data                TEXT,
    starred                  INTEGER,
    lookup_tables            INTEGER,
    sort_id                  INTEGER NOT NULL DEFAULT 0,
    message_add_on_flags     INTEGER,
    view_mode                INTEGER,
    translated_text          TEXT,
    view_replies_thread_id   INTEGER,
    server_sts               INTEGER
);
CREATE TABLE message_album (
    message_row_id       INTEGER PRIMARY KEY,
    image_count          INTEGER NOT NULL DEFAULT 0,
    video_count          INTEGER NOT NULL DEFAULT 0,
    expected_image_count INTEGER,
    expected_video_count INTEGER
);
CREATE TABLE message_association (
    _id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    child_message_row_id  INTEGER NOT NULL,
    parent_message_row_id INTEGER NOT NULL,
    association_type      INTEGER NOT NULL
);
CREATE TABLE message_edit_info (
    message_row_id   INTEGER PRIMARY KEY,
    original_key_id  TEXT    NOT NULL,
    edited_timestamp INTEGER NOT NULL,
    sender_timestamp INTEGER NOT NULL
);
CREATE TABLE message_forwarded (
    message_row_id INTEGER PRIMARY KEY, forward_score INTEGER, forward_origin INTEGER
);
CREATE TABLE message_location (
    message_row_id                INTEGER PRIMARY KEY,
    chat_row_id                   INTEGER,
    latitude                      REAL,
    longitude                     REAL,
    place_name                    TEXT,
    place_address                 TEXT,
    url                           TEXT,
    live_location_share_duration  INTEGER,
    live_location_sequence_number INTEGER,
    live_location_final_latitude  REAL,
    live_location_final_longitude REAL,
    live_location_final_timestamp INTEGER,
    map_download_status           INTEGER
);
CREATE TABLE message_media (
    message_row_id                      INTEGER PRIMARY KEY,
    chat_row_id                         INTEGER,
    autotransfer_retry_enabled          INTEGER,
    multicast_id                        TEXT,
    media_job_uuid                      TEXT,
    transferred                         INTEGER,
    transcoded                          INTEGER,
    file_path                           TEXT,
    file_size                           INTEGER,
    suspicious_content                  INTEGER,
    trim_from                           INTEGER,
    trim_to                             INTEGER,
    face_x                              INTEGER,
    face_y                              INTEGER,
    media_key                           BLOB,
    media_key_timestamp                 INTEGER,
    width                               INTEGER,
    height                              INTEGER,
    has_streaming_sidecar               INTEGER,
    gif_attribution                     INTEGER,
    thumbnail_height_width_ratio        REAL,
    direct_path                         TEXT,
    first_scan_sidecar                  BLOB,
    first_scan_length                   INTEGER,
    message_url                         TEXT,
    mime_type                           TEXT,
    file_length                         INTEGER,
    media_name                          TEXT,
    file_hash                           TEXT,
    media_duration                      INTEGER,
    page_count                          INTEGER,
    enc_file_hash                       TEXT,
    partial_media_hash                  TEXT,
    partial_media_enc_hash              TEXT,
    is_animated_sticker                 INTEGER,
    original_file_hash                  TEXT,
    mute_video                          INTEGER DEFAULT 0,
    media_caption                       TEXT,
    media_upload_handle                 TEXT,
    sticker_flags                       INTEGER,
    raw_transcription_text              TEXT,
    first_viewed_timestamp              INTEGER,
    doodle_id                           TEXT,
    media_source_type                   INTEGER,
    accessibility_label                 TEXT,
    media_transcode_quality             INTEGER DEFAULT 0,
    metadata_url                        TEXT,
    motion_photo_presentation_offset_ms INTEGER,
    qr_url                              TEXT,
    media_key_domain                    INTEGER,
    e2ee_media_key                      BLOB,
    premium_message                     INTEGER,
    emoji_tags                          TEXT,
    is_offloaded                        INTEGER
);
CREATE TABLE message_order (
    message_row_id    INTEGER PRIMARY KEY,
    order_id          TEXT,
    thumbnail         BLOB,
    order_title       TEXT,
    item_count        INTEGER,
    status            INTEGER,
    surface           INTEGER,
    message           TEXT,
    seller_jid        INTEGER,
    token             TEXT,
    currency_code     TEXT,
    total_amount_1000 INTEGER,
    message_version   INTEGER,
    catalog_type      TEXT
);
CREATE TABLE message_product (
    message_row_id      INTEGER PRIMARY KEY,
    business_owner_jid  INTEGER,
    product_id          TEXT,
    title               TEXT,
    description         TEXT,
    currency_code       TEXT,
    amount_1000         INTEGER,
    retailer_id         TEXT,
    url                 TEXT,
    product_image_count INTEGER,
    sale_amount_1000    INTEGER,
    body                TEXT,
    footer              TEXT,
    signed_url          TEXT
);
CREATE TABLE message_quoted (
    message_row_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_row_id                INTEGER NOT NULL,
    parent_message_chat_row_id INTEGER NOT NULL,
    from_me                    INTEGER NOT NULL,
    sender_jid_row_id          INTEGER,
    key_id                     TEXT    NOT NULL,
    timestamp                  INTEGER,
    message_type               INTEGER,
    origin                     INTEGER,
    text_data                  TEXT,
    payment_transaction_id     TEXT,
    lookup_tables              INTEGER,
    quoted_source              INTEGER,
    quoted_type                INTEGER
);
CREATE TABLE message_revoked (
    message_row_id INTEGER PRIMARY KEY, revoked_key_id TEXT NOT NULL, admin_jid_row_id INTEGER, revoke_timestamp INTEGER
);
CREATE TABLE message_system (message_row_id INTEGER PRIMARY KEY, action_type INTEGER NOT NULL);
CREATE TABLE message_system_block_contact (message_row_id INTEGER PRIMARY KEY, is_blocked INTEGER);
CREATE TABLE message_system_chat_participant (message_row_id INTEGER, user_jid_row_id INTEGER);
CREATE TABLE message_system_group (message_row_id INTEGER PRIMARY KEY, is_me_joined INTEGER);
CREATE TABLE message_system_number_change (
    message_row_id INTEGER PRIMARY KEY, old_jid_row_id INTEGER, new_jid_row_id INTEGER
);
CREATE TABLE message_ui_elements (
    _id             INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    message_row_id  INTEGER NOT NULL,
    element_type    INTEGER,
    element_content TEXT,
    description     TEXT,
    template_id     TEXT,
    hsm_tag         TEXT,
    footer_text     TEXT,
    button_text     TEXT,
    message_type    INTEGER
);
CREATE TABLE message_vcard (
    _id INTEGER PRIMARY KEY AUTOINCREMENT, message_row_id INTEGER, vcard TEXT
);
CREATE TABLE props (_id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, value TEXT);

--
-- Data
--

-- Myself (#jid = 264)
INSERT INTO jid VALUES (264, '00000', 's.whatsapp.net', 0, 0, 0, '00000@s.whatsapp.net');
INSERT INTO props VALUES (48857, 'user_push_name', 'Aaaaa Aaaaaaaaaaa');

-- User 1 (#jid = 252)
INSERT INTO jid VALUES (252, '11111', 's.whatsapp.net', 0, 0, 0, '11111@s.whatsapp.net');


-- A group (#jid = 2512)
INSERT INTO chat
VALUES (338, 2708, 0, 'My Group', 1643607839000, 750, 750, 750, 750, 1, 1, 1661417508000, 0, 0.0, 1, 0, 0, 0, 0, 1,
        0, 1, 0, 0, NULL, 0, 0, 0, 0, 0, 0, 0, 0, 0, 750, 750,
        750, 750, 0, 0, NULL, NULL, 0,
        NULL, 2, 2708, 2, -1, 0, 0, NULL, 0, 0);
INSERT INTO jid VALUES (2708, '100000000000000001', 'g.us', 0, 0, 1, '100000000000000001@g.us');

-- Media album (#parent_msg = 12114)
INSERT INTO message
VALUES (12114, 338, 0, 'GROUPMSG00100', 252, 0, 0, 6, NULL, 0, 0, 1776594122000, 1776594122291, -1,
        99, NULL, 0, 2048, 12114, 0, 0, NULL, NULL, NULL);
INSERT INTO message
VALUES (12115, 338, 0, 'GROUPMSG00101', 252, 0, 0, 6, NULL, 67108864, 0, 1776594122000, 1776594122466, -1,
        1, replace('Multiline\n\nmessage', '\n', char(10)), 0, 0, 12115, 0, 2, NULL, NULL, NULL);
INSERT INTO message
VALUES (12116, 338, 0, 'GROUPMSG00102', 252, 0, 0, 6, NULL, 67108864, 0, 1776594122000, 1776594122811, -1,
        1, NULL, 0, 0, 12116, 0, 2, NULL, NULL, NULL);

INSERT INTO message_album VALUES (12114, 2, 0, 2, 0);

-- Note the reversed order of the media messages!
-- WA does that, but it still groups media by message row id.
INSERT INTO message_association VALUES (13, 12116, 12114, 2);
INSERT INTO message_association VALUES (14, 12115, 12114, 2);

INSERT INTO message_media
VALUES (12115, 338, 1, NULL, 'c9357128-2bef-421a-93b2-42bb814b95e3', 1, 0,
        'Media/album-2.jpg', 136724, 0, 0, 0, 619, 755,
        X'a603b688778cfb623631e3e12a6a4e4ec7ef4d544a4bfb7e93e67803d2275375', 1776594120000, 1204, 1600, 0, 0, 1.3125,
        '/doesntmatter', X'b3fddaf79aa91265fa9e', 20296, 'https://mmg.whatsapp.net/doesntmatter0&mms3=true',
        'image/jpeg', 136724, NULL, 'meh', 0, 0,
        'meh', 'meh', NULL, 0, NULL, 0,
        NULL, NULL, NULL, NULL, 0, NULL, -1, NULL, 0, NULL, 0, NULL, 0, NULL, 0, NULL, 0);
INSERT INTO message_media
VALUES (12116, 338, 1, NULL, '70527068-f55f-4e4d-97db-a61654e0bc79', 1, 0,
        'Media/album-1.jpg', 81833, 0, 0, 0, 0, 0,
        X'01aee12b97f95f04bced57707f1a34b8c5423bf132f4ddc22c8bb7706b72232d', 1776594120000, 1204, 1600, 0, 0, 1.3125,
        '/doesntmatter', X'86e69b382bcb3480140d', 14536, 'https://mmg.whatsapp.net/doesntmatter0&mms3=true',
        'image/jpeg', 81833, NULL, 'meh', 0, 0,
        'meh', 'meh', NULL, 0, NULL, 0,
        NULL, NULL, NULL, NULL, 0, NULL, -1, NULL, 0, NULL, 0, NULL, 0, NULL, 0, NULL, 0);


-- Personal chat with user 1 (jid = #252)
INSERT INTO chat
VALUES (13, 252, 0, NULL, 1632502361031, 12243, 12243, 12243, 12242, 1, 1, 1777813013000, NULL, 0.0, 1, 0, 0, 0, 0, 1,
        0, 1, 0, 0, NULL, 0, 0, 0, 0, 106, 106, 0, NULL, NULL,
        12243, 12243, 12243, 12242, 0, 0, NULL, 0, 0,
        'general', 0, 252, 2, -1, 0, 0, NULL, 0, 0);

-- SentCart message
INSERT INTO message
VALUES (12205, 13, 1, 'PERSONALMSG100100', 0, 13, 0, 0, NULL, 0, 0, 1777808710229, 1777808711465, 1777808711000,
        44, NULL, 0, 0, 12205, 0, 0, NULL, NULL, NULL);

INSERT INTO message_order
VALUES (12205, '1333111515535703', X'deadbeef',
        'Order Title', 1, 1, 1, '', 252, 'meh', NULL, NULL, 1, 'NATIVE');

INSERT INTO message_media
VALUES (12205, 13, 0, NULL, 'c11ef04f-d54f-4b7d-9cac-27dff907ee27', 1, 0,
        'Media/sent-cart.jpeg', 246751, 0, 0, 0, 0, 0,
        X'd8b7749fc6d294615e042802395551f3a6295f097485fce780c15de33a48f977', 1777808710291, 0, 0, 0, 0, 0.75,
        '/doesntmatter', NULL, 0, 'https://mmg.whatsapp.net/o1/doesntmatter',
        NULL, 246751, 'sent-cart-real-name.jpeg', 'meh', 0, 0,
        'meh', NULL, NULL, 0, NULL, 0,
        NULL, NULL, NULL, NULL, 0, NULL, -1, NULL, 0, NULL, NULL, NULL, 0, X'deadbeef', 0, NULL, NULL);

-- SentBusinessItem message
INSERT INTO message
VALUES (12241, 13, 0, 'PERSONALMSG100101', 0, 16, 0, 0, NULL, 0, 0, 1777812766000, 1777812767206, -1,
        23, NULL, 0, 0, 12241, 0, 0, NULL, NULL, NULL);

INSERT INTO message_product
VALUES (12241, 223, '4903023773137584',
        'Item Title', 'Item Description', 'USD', 0, '', '', 10, 0, '', '', '');

INSERT INTO message_media
VALUES (12241, 13, 1, NULL, '1bf3a8ab-333d-4544-bab0-beb6f2847e14', 1, 0,
        'Media/sent-business-item.jpg', 264270, 0, 0, 0, 0, 0,
        X'78fa3d0afda1049f82ee0e2c9111d0ba49a98bdbaf4fbabcc6fb55e3799da5bc', 1777812765000, 1600, 1200, 1, 0, 1.0,
        '/doesntmatter', X'72ccfbc720ba5de53b4f', 18713, 'https://mmg.whatsapp.net/o1/doesntmatter',
        'image/jpeg', 264270, NULL, 'meh', 0, 0,
        'meh', 'meh', NULL, 0, NULL, 0,
        NULL, NULL, NULL, NULL, 0, NULL, 0, NULL, 0, NULL, NULL, NULL, 0, NULL, 0, NULL, NULL);
