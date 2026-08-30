use super::*;

pub(super) fn parse(
    feedback_client: &dyn FeedbackClientSync,
    root_obj: &Object,
    ds_uuid: &PbUuid,
    myself: &mut User,
) -> Result<(Users, Vec<ChatWithMessages>)> {
    feedback_client.set_load_status(LoadStatus::new_processing("users".to_owned()));
    let mut users: Users = Default::default();
    preparse_chat_users("<root>", root_obj, ds_uuid, &mut users)?;

    // In single chat, self section is not present. As such, myself must be populated from users.
    let mut users_vec = users.id_to_user.values().cloned().collect_vec();
    let myself_idx = feedback_client.choose_myself(&users_vec)?;
    *myself = users_vec.swap_remove(myself_idx);

    let cwm_option =
        parse_chat(feedback_client, "<root>", root_obj, myself.id(), &users)?;
    let cwms = match cwm_option {
        None =>
            bail!("Chat was skipped entirely!"),
        Some(mut cwm) => {
            cwm.chat.ds_uuid = ds_uuid.clone();
            vec![cwm]
        }
    };

    Ok((users, cwms))
}
