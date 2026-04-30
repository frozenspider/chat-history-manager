--
-- Schema
--

CREATE TABLE conversation_info (
    user_id                             text primary key on conflict replace,
    gender                              integer,
    user_name                           text,
    user_image_url                      text,
    user_deleted                        boolean,
    max_unanswered_messages             integer,
    sending_multimedia_enabled          integer,
    disabled_multimedia_explanation     text,
    multimedia_visibility_options       text,
    enlarged_emojis_max_count           integer,
    photo_url                           text,
    age                                 integer not null,
    is_inapp_promo_partner              boolean,
    game_mode                           integer,
    match_status                        text,
    chat_theme_settings                 text,
    chat_input_settings                 text    not null,
    is_open_profile_enabled             boolean,
    conversation_type                   text    not null,
    extra_message                       text,
    user_photos                         text    not null,
    photo_id                            text,
    work                                text,
    education                           text,
    photo_count                         integer not null,
    common_interest_count               integer not null,
    bumped_into_count                   integer not null,
    is_liked_you                        boolean not null,
    forwarding_settings                 text,
    is_reply_allowed                    boolean not null,
    live_location_settings              text,
    is_disable_private_detector_enabled boolean not null,
    member_count                        integer,
    is_url_parsing_allowed              boolean not null,
    is_user_verified                    boolean not null,
    last_message_status                 text,
    encrypted_user_id                   text,
    covid_preferences                   text,
    mood_status_emoji                   text,
    mood_status_name                    text,
    show_dating_hub_entry_point         boolean not null,
    hive_id                             text,
    hive_pending_join_request_count     integer,
    last_seen_message_id                text,
    is_best_bee                         boolean not null,
    photo_background_color              integer,
    location                            text,
    statusIndicators                    text    not null
);

CREATE TABLE message (
    _id                   integer primary key autoincrement,
    id                    text unique,
    conversation_id       text    not null,
    sender_id             text,
    sender_name           text,
    recipient_id          text    not null,
    created_timestamp     int     not null,
    modified_timestamp    int     not null,
    status                text    not null,
    is_masked             int     not null,
    payload               text    not null,
    reply_to_id           text,
    is_reply_allowed      boolean not null,
    is_forwarded          boolean not null,
    is_forwarding_allowed boolean not null,
    send_error_type       string,
    sender_avatar_url     text,
    is_incoming           boolean not null,
    payload_type          text    not null,
    is_liked              int     not null,
    is_like_allowed       int     not null,
    is_likely_offensive   boolean not null,
    clear_chat_version    int     not null,
    composed_offline      boolean not null
);

--
-- Users
--

INSERT INTO conversation_info
VALUES ('1234567891', 2, NULL, NULL, 0, NULL, 1, NULL, NULL, 3,
        NULL, 0, 0, NULL, NULL, NULL,
        '{"text":{"enabled":"null_placeholder"},"photo":{"hidden":"null_placeholder"},"gifts":{"hidden":"null_placeholder"},"gifs":{"hidden":"null_placeholder"},"instant_audio":{"hidden":"null_placeholder"},"instant_video":{"hidden":"null_placeholder"},"location":{"hidden":"null_placeholder"},"questions_game":{"hidden":"null_placeholder"},"good_openers":{"hidden":"null_placeholder"},"polls":{"hidden":"null_placeholder"}}', 1, 'User', '',
        '[]', NULL, NULL, NULL, 0, 0,
        0, 0, NULL, 0, NULL, 0, NULL, 0, 0, NULL,
        'null-encrypted-id', NULL, NULL, NULL, 0, NULL, NULL, NULL, 0, NULL, NULL, '[]');

--
-- Chats
--

-- Pretty sure SUBSTITUTE messages are from the system (and not from the deleted user that this one probably is).
INSERT INTO message
VALUES (4, '10000000', '1234567891', 'null-encrypted-id', NULL, 'my-encrypypted-id', 1692781351000, 1692781351000,
        'ON_SERVER', 0,
        '{"text":"Message from NULL named user","type":"SUBSTITUTE","substitute_id":""}',
        NULL, 1, 0, 0, NULL, NULL, 1, 'TEXT', 0, 0, 0, 1375123987, 0);
