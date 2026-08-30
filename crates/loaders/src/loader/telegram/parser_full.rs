use super::*;

pub(super) fn parse<'a, 'b>(
    feedback_client: &dyn FeedbackClientSync,
    root_obj: &'a Object<'b>,
    ds_uuid: &PbUuid,
    myself: &mut User
) -> Result<(Users, Vec<ChatWithMessages>)> {
    let mut chats_with_messages: Vec<ChatWithMessages> = vec![];

    struct ChatObjWithPath<'a, 'b> {
        chat_json: &'a Object<'b>,
        json_path: String,
    }

    let mut chats_vec: Vec<ChatObjWithPath> = vec![];

    // First pass: preparse users (including myself), and prepare chats_vec for second pass
    let users: Users = {
        feedback_client.set_load_status(LoadStatus::new_parsing("users", None));

        let mut users: Users = Default::default();
        parse_object(root_obj, "root", |CB { key, value, wrong_key_action }| match key {
            "about" => consume(),
            "profile_pictures" => consume(),
            "frequent_contacts" => consume(),
            "other_data" => consume(),
            "stories" => consume(),
            "profile_music" => consume(),
            "sessions" => consume(),
            "web_sessions" => consume(),
            "contacts" =>
                parse_bw_as_object(value, "personal_information", |CB { key, value, wrong_key_action }| match key {
                    "about" => consume(),
                    "list" => {
                        for v in value.as_array().context("Contact list is not an array!")? {
                            let mut contact = parse_contact("contact", v)?;
                            contact.ds_uuid = ds_uuid.clone();
                            users.insert(contact);
                        }
                        Ok(())
                    }
                    _ => wrong_key_action()
                }),
            "personal_information" => {
                let json_path = "personal_information";
                parse_bw_as_object(value, json_path, |CB { key, value: v, wrong_key_action }| match key {
                    "about" => consume(),
                    "user_id" => {
                        myself.id = as_i64!(v, json_path, "user_id");
                        Ok(())
                    }
                    "first_name" => {
                        myself.first_name_option = Some(as_string!(v, json_path, "first_name"));
                        Ok(())
                    }
                    "last_name" => {
                        myself.last_name_option = Some(as_string!(v, json_path, "last_name"));
                        Ok(())
                    }
                    "username" => {
                        myself.username_option = Some(as_string!(v, json_path, "username"));
                        Ok(())
                    }
                    "phone_number" => {
                        myself.phone_number_option = Some(PhoneNumber::from_raw(as_str!(v, json_path, "phone_number")).0);
                        Ok(())
                    }
                    "bio" => consume(),
                    _ => wrong_key_action()
                })?;
                if myself.id == 0 {
                    bail!("personal_information.user_id is missing!")
                }
                Ok(())
            }
            "chats" => {
                if myself.id == 0 {
                    bail!("personal_information section is missing!");
                }

                let json_path = "chats";

                let chat_arr = as_object!(value, "chats")
                    .get("list").context("No chats list in dataset!")?
                    .as_array().with_context(|| format!("{json_path} list is not an array!"))?;
                for chat_json in chat_arr.iter() {
                    let chat_json = as_object!(chat_json, json_path, "chat");
                    let json_path = format!("{json_path}.chat");
                    // Name will not be present for saved messages
                    let json_path = match chat_json.get("name") {
                        Some(name) => format!("{json_path}[{}]", name),
                        None => format!("{json_path}[#{}]", get_field!(chat_json, json_path, "id"))
                    };
                    chats_vec.push(ChatObjWithPath { chat_json, json_path });
                }

                Ok(())
            }
            "left_chats" => {
                // We don't want to import "left_chats" section!
                consume()
            }
            _ => wrong_key_action()
        })?;

        // Pre-populate users with users chats.
        for ChatObjWithPath { chat_json, json_path } in chats_vec.iter() {
            // Name will not be present for saved messages
            if !chat_json.contains_key("name") {
                continue;
            }
            let short_user = NormalizedShortUser::new(
                parse_user_id(get_field!(chat_json, json_path, "id"))?,
                get_field_string_option!(chat_json, json_path, "name"),
            );
            // Doesn't really make sense to pre-populate users without names.
            if short_user.0.full_name_option.is_none() {
                continue;
            }
            append_user(short_user, &mut users, ds_uuid)?;
        }

        for ChatObjWithPath { chat_json, json_path } in chats_vec.iter() {
            preparse_chat_users(&json_path, chat_json, ds_uuid, &mut users)?;
        }

        users.insert(myself.clone());
        users
    };

    let myself = &*myself; // Reborrow as immutable

    // Second pass: parse chats and messages, now that we have all users
    for ChatObjWithPath { chat_json, json_path } in chats_vec {
        if let Some(mut cwm) = parse_chat(feedback_client, &json_path, chat_json, myself.id(), &users)? {
            cwm.chat.ds_uuid = ds_uuid.clone();
            chats_with_messages.push(cwm);
        }
    }

    Ok((users, chats_with_messages))
}
