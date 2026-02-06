use std::collections::hash_map::Entry;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use simd_json::BorrowedValue;
use simd_json::prelude::*;

use crate::prelude::*;
use super::*;

pub struct InstagramDataLoader;

const SECRET_CONVERSATIONS_FILENAME: &str = "secret_conversations.json";

impl DataLoader for InstagramDataLoader {
    fn name(&self) -> String {
        "Instagram (Export)".to_owned()
    }

    fn looks_about_right_inner(&self, path: &Path) -> EmptyRes {
        let filename = path_file_name(path)?;
        if filename != SECRET_CONVERSATIONS_FILENAME {
            bail!("File is not \"{SECRET_CONVERSATIONS_FILENAME}\"");
        }
        Ok(())
    }

    fn load_inner(&self, path: &Path, ds: Dataset, feedback_client: &dyn FeedbackClientSync) -> Result<Box<InMemoryDao>> {
        parse_instagram_export(path, ds, feedback_client)
    }
}

/// Resolves the root path from the secret_conversations.json file.
/// The structure is: root/your_instagram_activity/messages/secret_conversations.json
fn get_root_path(secret_conversations_path: &Path) -> Result<PathBuf> {
    secret_conversations_path
        .parent() // messages
        .and_then(|p| p.parent()) // your_instagram_activity
        .and_then(|p| p.parent()) // root
        .map(|p| p.to_path_buf())
        .ok_or_else(|| anyhow!("Cannot resolve root path from {}", secret_conversations_path.display()))
}

fn parse_instagram_export(
    path: &Path,
    ds: Dataset,
    feedback_client: &dyn FeedbackClientSync,
) -> Result<Box<InMemoryDao>> {
    let root_path = get_root_path(path)?;
    let messages_path = path.parent().unwrap(); // messages folder

    log::info!("Parsing Instagram export from '{}'", root_path.display());
    let start_time = Instant::now();

    // Collect myself info from personal_information if available
    let myself_name = get_myself_name(&root_path)?;
    log::info!("Detected myself name: {:?}", myself_name);

    // Users map: name -> User
    let mut users: HashMap<String, User, Hasher> = HashMap::with_hasher(hasher());
    let mut chats_with_messages: Vec<ChatWithMessages> = vec![];

    // Process inbox and message_requests folders
    let inbox_path = messages_path.join("inbox");
    let message_requests_path = messages_path.join("message_requests");

    for folder_path in [inbox_path, message_requests_path] {
        if !folder_path.exists() {
            continue;
        }

        for entry in fs::read_dir(&folder_path)? {
            let entry = entry?;
            let chat_folder = entry.path();
            if !chat_folder.is_dir() {
                continue;
            }

            // Find all message_*.json files in the chat folder
            let mut message_files: Vec<PathBuf> = vec![];
            for file_entry in fs::read_dir(&chat_folder)? {
                let file_path = file_entry?.path();
                let file_name = path_file_name(&file_path)?;
                if file_name.starts_with("message_") && file_name.ends_with(".json") {
                    message_files.push(file_path);
                }
            }

            // Sort message files (message_1.json, message_2.json, etc.)
            message_files.sort_by_key(|p| path_file_name(p).expect("Invalid file name").to_owned());

            // Parse all message files for this chat
            if let Some(cwm) = parse_chat_folder(&chat_folder, &message_files, &ds.uuid, &mut users, &root_path)? {
                chats_with_messages.push(cwm);
            }
        }
    }

    log::info!("Parsed in {} ms", start_time.elapsed().as_millis());

    // Determine myself
    let myself_id = determine_myself(&users, myself_name.as_deref(), feedback_client)?;

    let mut users_vec: Vec<User> = users.into_values().collect();
    // Set myself to be a first member
    users_vec.sort_by_key(|u| if u.id == myself_id { i64::MIN } else { u.id });

    let parent_name = path_file_name(root_path.as_path())?;
    let mut result = Box::new(InMemoryDao::new_single(
        format!("Instagram ({})", parent_name),
        ds,
        root_path,
        UserId(myself_id),
        users_vec,
        chats_with_messages,
    ));
    result.remove_orphan_users();
    Ok(result)
}

/// Try to get the user's name from personal_information.json
fn get_myself_name(root_path: &Path) -> Result<Option<String>> {
    let personal_info_path = root_path
        .join("personal_information")
        .join("personal_information")
        .join("personal_information.json");

    if !personal_info_path.exists() {
        return Ok(None);
    }

    let Some(content) = fs::read(&personal_info_path).ok() else {
        log::warn!("personal_information.profile_user could not be read");
        return Ok(None);
    };
    let mut content = content;
    let parsed: BorrowedValue = simd_json::to_borrowed_value(&mut content)?;

    let json_path = "personal_information";
    let parsed = as_object!(parsed, "");

    let profile_user = get_field_array!(parsed, json_path, "profile_user");
    if profile_user.len() != 1 {
        log::warn!("personal_information.profile_user has more than one user");
        return Ok(None);
    }

    let user = &profile_user[0];
    let json_path = "personal_information.profile_user[0]";
    let user = as_object!(user, json_path);
    let string_map_data = get_field_object!(user, json_path, "string_map_data");
    let json_path = format!("{json_path}.string_map_data");
    let name = get_field_object!(string_map_data, json_path, "Name");
    let json_path = format!("{json_path}.Name");
    let name = get_field_string_option!(name, &json_path, "value");
    Ok(name.map(|v| fix_encoding(&v)))
}

fn determine_myself(
    users: &HashMap<String, User, Hasher>,
    myself_name: Option<&str>,
    feedback_client: &dyn FeedbackClientSync,
) -> Result<i64> {
    // Try to find by name first
    if let Some(name) = myself_name {
        for user in users.values() {
            if user.first_name_option.as_deref() == Some(name) {
                return Ok(user.id);
            }
        }
    }

    // Fall back to asking user
    let users_vec: Vec<User> = users.values().cloned().collect();
    if users_vec.is_empty() {
        bail!("No users found in the export!");
    }

    let idx = feedback_client.choose_myself(&users_vec)?;
    Ok(users_vec[idx].id)
}

fn parse_chat_folder(
    chat_folder: &Path,
    message_files: &[PathBuf],
    ds_uuid: &PbUuid,
    users: &mut HashMap<String, User, Hasher>,
    root_path: &Path,
) -> Result<Option<ChatWithMessages>> {
    if message_files.is_empty() {
        return Ok(None);
    }

    let mut all_messages: Vec<Message> = vec![];
    let mut participants: Vec<String> = vec![];
    let mut chat_title: Option<String> = None;

    for message_file in message_files {
        let mut file_content = fs::read(message_file)?;
        let parsed = simd_json::to_borrowed_value(&mut file_content)?;
        let json_path = message_file.display().to_string();

        // Parse participants (same in all files)
        if participants.is_empty() {
            if let Some(p) = parsed.get("participants") {
                let p_array = as_array!(p, json_path, "participants");
                for participant in p_array {
                    let name = get_field_string!(as_object!(participant, json_path), json_path, "name");
                    participants.push(fix_encoding(&name));
                }
            }

            // Get chat title from first participant (the other person) or folder name
            if let Some(title) = parsed.get("title") {
                chat_title = as_string_option!(title, json_path, "title").map(|s| fix_encoding(&s));
            }
        }

        // Parse messages
        if let Some(messages_json) = parsed.get("messages") {
            let messages_array = as_array!(messages_json, json_path, "messages");
            for (idx, msg_json) in messages_array.iter().enumerate() {
                let msg_path = format!("{}.messages[{}]", json_path, idx);
                if let Some(msg) = parse_message(&msg_path, msg_json, ds_uuid, users, root_path)? {
                    all_messages.push(msg);
                }
            }
        }
    }

    if all_messages.is_empty() {
        return Ok(None);
    }

    // Ensure all participants are in users map
    for name in &participants {
        get_or_create_user(users, name, ds_uuid);
    }

    // Sort messages by timestamp (Instagram exports them in reverse order)
    all_messages.sort_by_key(|m| m.timestamp);

    // Assign internal IDs
    for (idx, msg) in all_messages.iter_mut().enumerate() {
        msg.internal_id = idx as i64;
    }

    // Extract chat ID from folder name (e.g., "username_1234567890")
    let folder_name = chat_folder.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");
    let chat_id = extract_chat_id(folder_name);

    // Determine chat type and name
    let is_group = participants.len() > 2;
    let chat_name = chat_title.or_else(|| {
        // For personal chats, use the other person's name
        if !is_group && participants.len() == 2 {
            // Try to figure out which one is "myself" - we can't reliably know yet
            // Just use the first participant that's not obviously the owner
            Some(participants[0].clone())
        } else {
            None
        }
    });

    // Collect member IDs
    let member_ids: Vec<i64> = participants
        .iter()
        .filter_map(|name| users.get(name).map(|u| u.id))
        .collect();

    let chat = Chat {
        ds_uuid: ds_uuid.clone(),
        id: chat_id,
        name_option: chat_name,
        source_type: SourceType::InstagramExport as i32,
        tpe: if is_group { ChatType::PrivateGroup as i32 } else { ChatType::Personal as i32 },
        img_path_option: None,
        member_ids,
        msg_count: all_messages.len() as i32,
        main_chat_id: None,
    };

    Ok(Some(ChatWithMessages { chat, messages: all_messages }))
}

fn extract_chat_id(folder_name: &str) -> i64 {
    // Format: "username_1234567890" - extract the number part
    if let Some(pos) = folder_name.rfind('_') {
        if let Ok(id) = folder_name[pos + 1..].parse::<i64>() {
            return id;
        }
    }
    // Fallback: hash the folder name
    use std::hash::{Hash, Hasher as StdHasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    folder_name.hash(&mut hasher);
    hasher.finish() as i64
}

fn get_or_create_user(
    users: &mut HashMap<String, User, Hasher>,
    name: &str,
    ds_uuid: &PbUuid,
) -> i64 {
    match users.entry(name.to_owned()) {
        Entry::Occupied(e) => e.get().id,
        Entry::Vacant(e) => {
            // Generate a user ID from the name hash
            use std::hash::{Hash, Hasher as StdHasher};
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            name.hash(&mut hasher);
            let id = (hasher.finish() & 0x7FFFFFFFFFFFFFFF) as i64; // Ensure positive

            let user = User {
                ds_uuid: ds_uuid.clone(),
                id,
                first_name_option: Some(name.to_owned()),
                last_name_option: None,
                username_option: None,
                phone_number_option: None,
                profile_pictures: vec![],
            };
            e.insert(user);
            id
        }
    }
}

fn parse_message(
    json_path: &str,
    msg_json: &BorrowedValue,
    ds_uuid: &PbUuid,
    users: &mut HashMap<String, User, Hasher>,
    _root_path: &Path,
) -> Result<Option<Message>> {
    let msg = as_object!(msg_json, json_path);

    let sender_name = fix_encoding(&get_field_string!(msg, json_path, "sender_name"));
    let timestamp_ms = get_field_i64!(msg, json_path, "timestamp_ms");
    let timestamp = timestamp_ms / 1000;

    // Get or create sender user
    let from_id = get_or_create_user(users, &sender_name, ds_uuid);

    // Parse content
    let content_string = get_field_string_option!(msg, json_path, "content").map(|s| fix_encoding(&s));

    // Skip reaction-only messages, they don't have any useful info anyway
    if content_string.as_deref().is_some_and(|c| {
        c == "Liked a message" ||
            (c.starts_with("Reacted ") && c.contains("to your message"))
    }) {
        return Ok(None);
    }

    let mut is_attachment_placeholder = false;
    let mut is_live_location = false;
    // In this case we only have share.original_content_owner
    let mut is_story_share = false;

    // Add main content text
    if let Some(ref content_string) = content_string {
        // Skip generic "X sent an attachment" messages if we have actual attachments
        is_attachment_placeholder = content_string.ends_with(" sent an attachment.")
            || content_string == "You sent an attachment.";

        is_story_share = content_string.ends_with(" shared a story.");

        // TODO: What if you shared a location yourself? (not encountered in export yet)
        is_live_location = content_string.ends_with(" sent a live location.");
    } else if !msg.contains_key("content") {
        // Instagram is really inconsistent with the content field.
        // So far it seems that if content is missing, then it's always a story share.
        is_story_share = true;
    }

    // Build text and content
    let mut msg_text_parts: Vec<RichTextElement> = vec![];
    let mut msg_contents: Vec<Content> = vec![];
    let mut forward_from = None;


    if let Some(share) = get_field_object_option!(msg, json_path, "share") {
        let json_path = format!("{}.share", json_path);

        let link = get_field_string_option!(share, json_path, "link");
        let share_text = get_field_string_option!(share, json_path, "share_text");
        let share_text = share_text.as_deref().map(fix_encoding).filter(|s| !s.is_empty());

        // Instagram has REALLY shitty and inconsistent structure of its json.
        // * is_story_share, then we only have original_content_owner - account name, no leading @.
        // * is_attachment_placeholder, then link is post URL, share_text is post title (sometimes empty),
        //   and original_content_owner is as above.
        // * No share_text, this is reply to your story.
        // * Content matches share_text exactly, and link is present in the text itself.
        // * Content, share_text and link are all distinct, share_text contains link preview text.
        // * Content matches link exactly, share_text (if exists!) contains link preview text.
        // * Content matches share_text exactly, there's no link and no additional info, wtf?

        forward_from = get_field_string_option!(share, json_path, "original_content_owner");

        if is_story_share {
            msg_text_parts.push(RichText::make_italic("(Story)".to_owned()));
        } else {
            if let Some(link) = link {
                if is_attachment_placeholder {
                    // Sometimes share_text is an empty string here so it gets discarded.
                    let text = share_text.unwrap_or(link.clone());
                    msg_text_parts.push(RichText::make_link(Some(text), link));
                } else {
                    let Some(content) = content_string else {
                        bail!("share.content is missing");
                    };
                    match share_text {
                        None => {
                            msg_text_parts.push(RichText::make_italic("(Reply to ".to_owned()));
                            msg_text_parts.push(RichText::make_link(Some("story".to_owned()), link));
                            msg_text_parts.push(RichText::make_italic(")\n".to_owned()));
                            msg_text_parts.push(RichText::make_plain(content));
                        }
                        Some(share_text) => {
                            if !share_text.is_empty() && content == share_text {
                                // Find the link position in the content
                                let Some(link_pos) = content.find(&link) else {
                                    bail!("Link not found in content despite matching share.share_text");
                                };
                                let link_end_pos = link_pos + link.len();
                                msg_text_parts.push(RichText::make_plain((&content[..link_pos]).to_owned()));
                                msg_text_parts.push(RichText::make_link(Some(link.clone()), link));
                                msg_text_parts.push(RichText::make_plain((&content[link_end_pos..]).to_owned()));
                            } else {
                                if content != link {
                                    msg_text_parts.push(RichText::make_plain(content));
                                }
                                msg_text_parts.push(RichText::make_link(Some(share_text), link));
                            }
                        }
                    }
                }
            } else {
                let Some(content) = content_string else {
                    bail!("share block w/o link is present but content is missing");
                };
                ensure!(share_text.as_ref().is_some_and(|st| st == &content), "share block w/o link is present but content doesn't match share.share_text");
                // We assume this is a regular text message
                msg_text_parts.push(RichText::make_plain(content));
            }
        }
    } else if is_attachment_placeholder {
        msg_text_parts.push(RichText::make_italic("(Reel not available)".to_owned()));
    } else if let Some(content) = content_string {
        // We assume this is a regular text message
        ensure!(!is_story_share, "Story share must have share block");
        msg_text_parts.push(RichText::make_plain(content.to_owned()));
    }

    // Parse photos
    if let Some(photos) = msg.get("photos") {
        if let Ok(photos_array) = photos.try_as_array() {
            for photo in photos_array {
                if let Some(uri) = photo.get("uri") {
                    if let Ok(Some(uri_str)) = as_string_option_res!(uri, json_path, "photos.uri") {
                        msg_contents.push(content!(Photo {
                            path_option: Some(uri_str),
                            width: 0,
                            height: 0,
                            mime_type_option: None,
                            is_one_time: false,
                        }));
                    }
                }
            }
        }
    }

    // Parse videos
    if let Some(videos) = msg.get("videos") {
        if let Ok(videos_array) = videos.try_as_array() {
            for video in videos_array {
                if let Some(uri) = video.get("uri") {
                    if let Ok(Some(uri_str)) = as_string_option_res!(uri, json_path, "videos.uri") {
                        // Extract thumbnail path separately to avoid macro-in-closure issues
                        let thumbnail_path = video.get("thumbnail")
                            .and_then(|t| t.get("uri"))
                            .and_then(|u| u.as_str())
                            .map(|s| s.to_owned());

                        msg_contents.push(content!(Video {
                            path_option: Some(uri_str),
                            file_name_option: None,
                            title_option: None,
                            performer_option: None,
                            width: 0,
                            height: 0,
                            mime_type: "video/mp4".to_owned(),
                            duration_sec_option: None,
                            thumbnail_path_option: thumbnail_path,
                            is_one_time: false,
                        }));
                    }
                }
            }
        }
    }

    // Parse audio files
    if let Some(audio_files) = msg.get("audio_files") {
        if let Ok(audio_array) = audio_files.try_as_array() {
            for audio in audio_array {
                if let Some(uri) = audio.get("uri") {
                    if let Ok(Some(uri_str)) = as_string_option_res!(uri, json_path, "audio_files.uri") {
                        msg_contents.push(content!(VoiceMsg {
                            path_option: Some(uri_str),
                            file_name_option: None,
                            mime_type: "audio/mp4".to_owned(),
                            duration_sec_option: None,
                        }));
                    }
                }
            }
        }
    }

    if is_live_location {
        // No info is actually available
        msg_contents.push(content!(Location {
            title_option: None,
            address_option: None,
            lat_str: "".to_owned(),
            lon_str: "".to_owned(),
            duration_sec_option: None,
        }));
    }

    // If we have no text and no content, skip this message
    if msg_text_parts.is_empty() && msg_contents.is_empty() {
        return Ok(None);
    }

    // Parse reactions and add as text suffix
    if let Some(reactions) = msg.get("reactions") {
        if let Ok(reactions_array) = reactions.try_as_array() {
            let reaction_strs: Vec<String> = reactions_array
                .iter()
                .filter_map(|r| {
                    let reaction = r.get("reaction")
                        .and_then(|v| v.as_str())
                        .map(fix_encoding)?;
                    let actor = r.get("actor")
                        .and_then(|v| v.as_str())
                        .map(fix_encoding)?;
                    Some(format!("{} {}", reaction, actor))
                })
                .collect();

            if !reaction_strs.is_empty() {
                if !msg_text_parts.is_empty() {
                    msg_text_parts.push(RichText::make_plain("\n".to_owned()));
                }
                msg_text_parts.push(RichText::make_plain(format!("[{}]", reaction_strs.join(", "))));
            }
        }
    }

    let text = normalize_rich_text(msg_text_parts);

    let regular = MessageRegular {
        edit_timestamp_option: None,
        is_deleted: false,
        forward_from_name_option: forward_from,
        reply_to_message_id_option: None,
        contents: msg_contents,
    };

    Ok(Some(Message::new(
        *NO_INTERNAL_ID,
        None, // Instagram doesn't provide message IDs
        timestamp,
        UserId(from_id),
        text,
        message::Typed::Regular(regular),
    )))
}

/// Fix Instagram's broken UTF-8 encoding.
/// Instagram exports text as UTF-8 bytes interpreted as Latin-1, then encoded again as UTF-8.
/// We need to reverse this: interpret the string as Latin-1 bytes and decode as UTF-8.
fn fix_encoding(s: &str) -> String {
    // Each character is a byte of the original UTF-8
    let bytes: Vec<u8> = s.chars().map(|c| c as u8).collect();
    String::from_utf8(bytes).unwrap_or_else(|_| s.to_owned())
}
