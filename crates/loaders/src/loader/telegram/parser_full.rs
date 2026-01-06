use super::*;

pub(super) fn parse(root_obj: &Object,
                    ds_uuid: &PbUuid,
                    myself: &mut User) -> Result<(Users, Vec<ChatWithMessages>)> {
    let mut users: Users = Default::default();
    let mut chats_with_messages: Vec<ChatWithMessages> = vec![];

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
                    myself.phone_number_option = Some(normalize_phone_number(as_str!(v, json_path, "phone_number")).0);
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

            let chats_arr: Vec<(&Object, String)> = as_object!(value, "chats")
                .get("list").context("No chats list in dataset!")?
                .as_array().with_context(|| format!("{json_path} list is not an array!"))?
                .iter().map(|chat_json| {
                    let chat_json = as_object!(chat_json, json_path, "chat");
                    let json_path = format!("{json_path}.chat");
                    // Name will not be present for saved messages
                    let json_path = match get_field!(chat_json, json_path, "name") {
                        Ok(name) => format!("{json_path}[{}]", name),
                        Err(_) => format!("{json_path}[#{}]", get_field!(chat_json, json_path, "id")?)
                    };
                    ok((chat_json, json_path))
                }).try_collect()?;

            // Pre-populate users with users chats.
            for (chat_json, json_path) in chats_arr.iter() {
                // Name will not be present for saved messages
                if !chat_json.contains_key("name") {
                    continue;
                }
                let short_user = ShortUser {
                    id: parse_user_id(get_field!(chat_json, json_path, "id")?)?,
                    full_name_option: get_field_string_option!(chat_json, json_path, "name"),
                };
                // Doesn't really make sense to pre-populate users without names.
                if short_user.full_name_option.is_none() {
                    continue;
                }
                let short_user = normalize_short_user(short_user)?;
                append_user(short_user, &mut users, ds_uuid)?;
            }

            for (chat_json, json_path) in chats_arr {
                if let Some(mut cwm) = parse_chat(&json_path, chat_json, ds_uuid, Some(&myself.id()), &mut users)? {
                    cwm.chat.ds_uuid = ds_uuid.clone();
                    chats_with_messages.push(cwm);
                }
            }

            Ok(())
        }
        "left_chats" => {
            // We don't want to import "left_chats" section!
            consume()
        }
        _ => wrong_key_action()
    })?;

    users.insert(myself.clone());

    Ok((users, chats_with_messages))
}
