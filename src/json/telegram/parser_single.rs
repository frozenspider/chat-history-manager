use crate::json::*;
use crate::json::telegram::*;

pub fn parse(root_obj: &Object,
             ds_uuid: &PbUuid,
             myself: &mut User,
             myself_chooser: MyselfChooser) -> Res<(Users, Vec<ChatWithMessages>)> {
    let mut users: Users = Default::default();
    let mut chats_with_messages: Vec<ChatWithMessages> = vec![];

    let mut cwm = parse_chat(root_obj, &ds_uuid, &myself.id, &mut users)?;
    if let Some(ref mut c) = cwm.chat {
        c.ds_uuid = Some(ds_uuid.clone());
    }
    chats_with_messages.push(cwm);

    // In single chat, self section is not present. As such, myself must be populated from users.
    let users_vec = users.id_to_user.values().collect_vec();
    let myself_idx = myself_chooser(&users_vec)?;
    let myself2 = users_vec[myself_idx];
    myself.id = myself2.id;
    myself.first_name = myself2.first_name.clone();
    myself.last_name = myself2.last_name.clone();
    myself.username = myself2.username.clone();
    myself.phone_number = myself2.phone_number.clone();

    Ok((users, chats_with_messages))
}