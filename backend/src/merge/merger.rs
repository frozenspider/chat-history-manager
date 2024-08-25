use std::io;
use itertools::Itertools;

use crate::dao::ChatHistoryDao;
use crate::dao::MutableChatHistoryDao;
use crate::dao::sqlite_dao::SqliteDao;
use crate::merge::analyzer::*;
use crate::prelude::*;

#[cfg(test)]
#[path = "merger_tests.rs"]
mod tests;

const BATCH_SIZE: usize = 1000;

/// Creates a new database containing dataset merged according to supplied merge decisions, as well as the rest of
/// `master_dao` datasets copied as-is.
/// user_merges and chat_merges should contain decisions for ALL users and chats.
pub fn merge_datasets(
    sqlite_dao_dir: &Path,
    master_dao: &dyn ChatHistoryDao,
    master_ds: &Dataset,
    slave_dao: &dyn ChatHistoryDao,
    slave_ds: &Dataset,
    user_merges: Vec<UserMergeDecision>,
    chat_merges: Vec<ChatMergeDecision>,
) -> Result<(SqliteDao, Dataset)> {
    measure(|| {
        fn get_users_and_cwds(dao: &dyn ChatHistoryDao, ds_uuid: &PbUuid)
                              -> Result<(HashMap<UserId, User>, HashMap<ChatId, ChatWithDetails>)> {
            Ok((dao.users(ds_uuid)?.into_iter().map(|u| (u.id(), u)).collect(),
                dao.chats(ds_uuid)?.into_iter().map(|cwd| (cwd.id(), cwd)).collect()))
        }

        let (master_users, master_cwds) = get_users_and_cwds(master_dao, &master_ds.uuid)?;
        let (slave_users, slave_cwds) = get_users_and_cwds(slave_dao, &slave_ds.uuid)?;

        // Input validity check: users
        let master_user_id_merges = user_merges.iter().filter_map(|m| m.master_user_id_option()).collect_vec();
        for uid in master_users.keys() {
            ensure!(master_user_id_merges.contains(uid), "Master user {} wasn't mentioned in merges", uid.0);
        }
        ensure!(master_users.len() == master_user_id_merges.len(), "User merges contained more master users than actually exist?");

        let slave_user_id_merges = user_merges.iter().filter_map(|m| m.slave_user_id_option()).collect_vec();
        for uid in slave_users.keys() {
            ensure!(slave_user_id_merges.contains(uid), "Slave user {} wasn't mentioned in merges", uid.0);
        }
        ensure!(slave_users.len() == slave_user_id_merges.len(), "User merges contained more slave users than actually exist?");

        // Input validity check: chats
        let master_chat_id_merges = chat_merges.iter().filter_map(|m| m.master_chat_id_option()).collect_vec();
        for cid in master_cwds.keys() {
            ensure!(master_chat_id_merges.contains(cid), "Master chat {} wasn't mentioned in merges", cid.0);
        }
        ensure!(master_cwds.len() == master_chat_id_merges.len(), "Chat merges contained more master chats than actually exist?");

        let slave_chat_id_merges = chat_merges.iter().filter_map(|m| m.slave_chat_id_option()).collect_vec();
        for cid in slave_cwds.keys() {
            ensure!(slave_chat_id_merges.contains(cid), "Slave chat {} wasn't mentioned in merges", cid.0);
        }
        ensure!(slave_cwds.len() == slave_chat_id_merges.len(), "Chat merges contained more slave chats than actually exist?");

        // Actual logic
        let sqlite_dao_file = sqlite_dao_dir.join(SqliteDao::FILENAME);
        let mut new_dao = SqliteDao::create(&sqlite_dao_file)?;
        let master = DaoMergeEntities { dao: master_dao, ds: master_ds, users: master_users, cwds: master_cwds };
        let slave = DaoMergeEntities { dao: slave_dao, ds: slave_ds, users: slave_users, cwds: slave_cwds };
        let new_dataset = merge_inner(&mut new_dao, master, slave, user_merges, chat_merges)?;
        let other_master_dataset_uuids = master_dao.datasets()?
            .into_iter()
            .map(|ds| ds.uuid)
            .filter(|ds_uuid| ds_uuid != &master_ds.uuid)
            .collect_vec();
        new_dao.copy_datasets_from(master_dao, &other_master_dataset_uuids)?;
        new_dao.vacuum()?;
        Ok((new_dao, new_dataset))
    }, |_, t| log::info!("Datasets merged in {t} ms"))
}

struct DaoMergeEntities<'a> {
    dao: &'a dyn ChatHistoryDao,
    ds: &'a Dataset,
    users: HashMap<UserId, User>,
    cwds: HashMap<ChatId, ChatWithDetails>,
}

fn merge_inner(
    new_dao: &mut SqliteDao,
    master: DaoMergeEntities,
    slave: DaoMergeEntities,
    user_merges: Vec<UserMergeDecision>,
    chat_merges: Vec<ChatMergeDecision>,
) -> Result<Dataset> {
    let new_ds = Dataset {
        uuid: PbUuid::random(),
        alias: format!("{} (merged)", master.ds.alias),
    };
    let new_ds = new_dao.insert_dataset(new_ds)?;

    let master_ds_root = master.dao.dataset_root(&master.ds.uuid)?;
    let slave_ds_root = slave.dao.dataset_root(&slave.ds.uuid)?;

    let chat_inserts = chat_merges.iter().filter_map(|cm| {
        match cm {
            ChatMergeDecision::Retain { master_chat_id } =>
                Some((master.cwds[&master_chat_id].clone(), &master_ds_root, cm)),
            ChatMergeDecision::DontMerge { chat_id } =>
                Some((master.cwds[&chat_id].clone(), &master_ds_root, cm)),
            ChatMergeDecision::Add { slave_chat_id } =>
                Some((slave.cwds[&slave_chat_id].clone(), &slave_ds_root, cm)),
            ChatMergeDecision::DontAdd { .. } =>
                None,
            ChatMergeDecision::Merge { chat_id, .. } => {
                let mut chat_to_insert = slave.cwds[&chat_id].clone();

                // If slave chat has no image, preserve master image
                let ds_root = if chat_to_insert.chat.get_img_path_option(&slave_ds_root).is_some_and(|p| p.exists()) {
                    &slave_ds_root
                } else {
                    let master_chat = &master.cwds[&chat_id];
                    chat_to_insert.chat.img_path_option = master_chat.chat.img_path_option.clone();
                    &master_ds_root
                };

                Some((chat_to_insert, ds_root, cm))
            }
        }
    }).collect_vec();

    // Users
    let selected_chat_members: HashSet<i64> =
        chat_inserts.iter().flat_map(|(cwd, _, _)| cwd.chat.member_ids.clone()).collect();
    let master_self = master.dao.myself(&master.ds.uuid)?;
    let slave_self = slave.dao.myself(&slave.ds.uuid)?;
    ensure!(master_self.id == slave_self.id, "Myself of merged datasets doesn't match!");
    for um in user_merges {
        macro_rules! iter_pps_master {
            ($user_id:ident) => { master.users[&$user_id].profile_pictures.iter().map(|pp| pp.to_absolute(&master_ds_root)) };
        }
        macro_rules! iter_pps_slave {
            ($user_id:ident) => { slave.users[&$user_id].profile_pictures.iter().map(|pp| pp.to_absolute(&slave_ds_root)) };
        }
        // Slave pictures always go before master pics, new is good, y'know
        let user_to_insert_option = match um {
            UserMergeDecision::Retain(user_id) =>
                Some((master.users[&user_id].clone(),
                      iter_pps_master!(user_id).collect_vec())),
            UserMergeDecision::MatchOrDontReplace(user_id) =>
                Some((master.users[&user_id].clone(),
                      iter_pps_slave!(user_id).chain(iter_pps_master!(user_id)).collect_vec())),
            UserMergeDecision::Add(user_id) =>
                Some((slave.users[&user_id].clone(),
                      iter_pps_slave!(user_id).collect_vec())),
            UserMergeDecision::DontAdd(user_id) if selected_chat_members.contains(&user_id.0) =>
                bail!("Cannot skip user {} because it's used in a chat that wasn't skipped", user_id.0),
            UserMergeDecision::DontAdd(_) =>
                None,
            UserMergeDecision::Replace(user_id) =>
                Some((slave.users[&user_id].clone(),
                      iter_pps_slave!(user_id).chain(iter_pps_master!(user_id)).collect_vec())),
        };
        if let Some((mut user, profile_pics)) = user_to_insert_option {
            user.ds_uuid = new_ds.uuid.clone();
            let is_myself = user.id == master_self.id;
            let profile_pics = dedup_profile_pics(profile_pics)?;
            let user = new_dao.insert_user(user, is_myself)?;
            new_dao.update_user_profile_pics(user, profile_pics)?;
        }
    }
    let final_users = new_dao.users(&new_ds.uuid)?;

    // Chats
    for (mut cwd, chat_ds_root, cm) in chat_inserts {
        cwd.chat.ds_uuid = new_ds.uuid.clone();

        // For merged personal chats, name should match whatever user name was chosen
        if cwd.chat.tpe == ChatType::Personal as i32 {
            let interlocutors = cwd.members.iter().filter(|u| u.id != master_self.id).collect_vec();
            if interlocutors.len() > 1 {
                bail!("Personal chat {} has multiple other members: {:?}",
                      cwd.chat.qualified_name(), interlocutors.iter().map(|u| u.id).collect_vec())
            }
            // Could happen e.g. if other members never wrote anything.
            if !interlocutors.is_empty() {
                let final_user = final_users.iter().find(|u| u.id == interlocutors[0].id).with_context(||
                format!("User {} not found among final users! Personal chat should've been skipped",
                        interlocutors[0].id))?;
                cwd.chat.name_option = final_user.pretty_name_option();
            }
        }

        let mut new_chat = new_dao.insert_chat(cwd.chat.clone(), chat_ds_root)?;

        macro_rules! master_cwd { () => { &master.cwds[&cwd.id()] }; }
        macro_rules! slave_cwd { () =>  { &slave.cwds[&cwd.id()] }; }

        // Messages
        let mut msg_count = 0;
        match cm {
            ChatMergeDecision::Retain { .. } =>
                msg_count += copy_all_messages(master.dao, master_cwd!(),
                                               &master_ds_root, new_dao, &new_chat,
                                               &final_users)?,
            ChatMergeDecision::DontMerge { .. } =>
                msg_count += copy_all_messages(master.dao, master_cwd!(),
                                               &master_ds_root, new_dao, &new_chat,
                                               &final_users)?,
            ChatMergeDecision::Add { .. } =>
                msg_count += copy_all_messages(slave.dao, slave_cwd!(),
                                               &slave_ds_root, new_dao, &new_chat,
                                               &final_users)?,
            ChatMergeDecision::DontAdd { .. } =>
                unreachable!(),
            ChatMergeDecision::Merge { message_merges, .. } => {
                let master_cwd = master_cwd!();
                let slave_cwd = slave_cwd!();

                #[derive(Clone, Copy, PartialEq)]
                enum Source { Master, Slave }

                for merge_decision in message_merges {
                    let inserts: Vec<(Source, Vec<Message>)> = match merge_decision {
                        MessagesMergeDecision::Match(v) => {
                            // While messages match, our matching rules allow either master or slave
                            // to have missing content.
                            // We keep master messages (updated with some data from slave) unless slave has new content.
                            //
                            // Note: We might be loading too much into memory at once!
                            // However, messages memory footprint is pretty small, so this isn't a big concern now.
                            let master_msgs =
                                master.dao.messages_slice(&master_cwd.chat,
                                                          v.first_master_msg_id.generalize(),
                                                          v.last_master_msg_id.generalize())?;
                            let slave_msgs =
                                slave.dao.messages_slice(&slave_cwd.chat,
                                                         v.first_slave_msg_id.generalize(),
                                                         v.last_slave_msg_id.generalize())?;
                            assert!(master_msgs.len() == slave_msgs.len());

                            let grouped_total_msgs = master_msgs.into_iter().zip(slave_msgs)
                                .map(|(mm, sm)| {
                                    let mm_files = mm.files(&master_ds_root).into_iter().filter(|f| f.exists()).collect_vec();
                                    let sm_files = sm.files(&slave_ds_root).into_iter().filter(|f| f.exists()).collect_vec();
                                    if mm_files.len() >= sm_files.len() {
                                        let mut mm = mm;
                                        update_with_slave_data(&mut mm, &sm);
                                        (mm, Source::Master)
                                    } else {
                                        (sm, Source::Slave)
                                    }
                                })
                                .chunk_by(|(_m, src)| *src);

                            let mut data_grouped = Vec::new();
                            for (source, group) in &grouped_total_msgs {
                                data_grouped.push((source, group.into_iter().map(|msg_ds| msg_ds.0).collect_vec()));
                            }
                            data_grouped
                        }
                        MessagesMergeDecision::Retain(v) => {
                            let msgs = master.dao.messages_slice(&master_cwd.chat,
                                                                 v.first_master_msg_id.generalize(),
                                                                 v.last_master_msg_id.generalize())?;
                            vec![(Source::Master, msgs)]
                        }
                        MessagesMergeDecision::Add(v) => {
                            let msgs = slave.dao.messages_slice(&slave_cwd.chat,
                                                                v.first_slave_msg_id.generalize(),
                                                                v.last_slave_msg_id.generalize())?;
                            vec![(Source::Slave, msgs)]
                        }
                        MessagesMergeDecision::DontAdd(_) => {
                            // Skip these messages
                            vec![]
                        }
                        MessagesMergeDecision::Replace(v) => {
                            // Treat exactly as Add
                            // TODO: Should we analyze content and make sure nothing is lost?
                            let msgs = slave.dao.messages_slice(&slave_cwd.chat,
                                                                v.first_slave_msg_id.generalize(),
                                                                v.last_slave_msg_id.generalize())?;
                            vec![(Source::Slave, msgs)]
                        }
                        MessagesMergeDecision::DontReplace(v) => {
                            // Treat exactly as Retain
                            let msgs = master.dao.messages_slice(&master_cwd.chat,
                                                                 v.first_master_msg_id.generalize(),
                                                                 v.last_master_msg_id.generalize())?;
                            vec![(Source::Master, msgs)]
                        }
                    };

                    for (source, msgs) in inserts {
                        let ds_root = match source {
                            Source::Master => &master_ds_root,
                            Source::Slave => &slave_ds_root,
                        };
                        let cwd = match source {
                            Source::Master => master_cwd,
                            Source::Slave => slave_cwd
                        };

                        msg_count += msgs.len();
                        for batch in &msgs.into_iter().chunks(BATCH_SIZE) {
                            let mut batch = batch.collect_vec();
                            for m in batch.iter_mut() {
                                fixup_members(m, &final_users, cwd)?;
                            }
                            new_dao.insert_messages(batch, &new_chat, ds_root)?;
                        }
                    }
                }
            }
        }
        new_chat.msg_count = msg_count as i32;
        new_dao.update_chat(new_chat.id(), new_chat)?;
    }

    Ok(new_ds)
}

fn copy_all_messages(
    src_dao: &dyn ChatHistoryDao,
    src_cwd: &ChatWithDetails,
    src_ds_root: &DatasetRoot,
    dst_dao: &mut SqliteDao,
    dst_chat: &Chat,
    final_users: &[User],
) -> Result<usize> {
    let mut offset = 0_usize;
    let mut msg_count = 0_usize;
    loop {
        let mut batch = src_dao.scroll_messages(&src_cwd.chat, offset, BATCH_SIZE)?;
        if batch.is_empty() { break; }
        msg_count += batch.len();
        for m in batch.iter_mut() {
            fixup_members(m, final_users, src_cwd)?;
        }
        dst_dao.insert_messages(batch, dst_chat, src_ds_root)?;
        offset += BATCH_SIZE;
    }
    Ok(msg_count)
}

/// Fixup messages who have 'members' field, to make them comply with resolved/final user names.
fn fixup_members(msg: &mut Message, final_users: &[User], cwd: &ChatWithDetails) -> EmptyRes {
    let fixup_members_inner = |members: &[String]| -> Vec<String> {
        // Unresolved members are kept as-is.
        let resolved_users = cwd.resolve_members(members);
        resolved_users.iter()
            .map(|uo| {
                uo.and_then(|u| final_users.iter().find(|u2| u2.id == u.id)).map(|u| u.pretty_name())
            })
            .enumerate()
            .map(|(i, name_option)| match name_option {
                None => members[i].clone(),
                Some(name) => name
            })
            .collect_vec()
    };

    match msg.typed_mut() {
        message::Typed::Regular(_) => { /* NOOP */ }
        message::Typed::Service(ms) => {
            use message_service::SealedValueOptional::*;
            match ms.sealed_value_optional {
                Some(GroupCreate(ref mut v)) => {
                    v.members = fixup_members_inner(&v.members);
                }
                Some(GroupInviteMembers(ref mut v)) => {
                    v.members = fixup_members_inner(&v.members);
                }
                Some(GroupRemoveMembers(ref mut v)) => {
                    v.members = fixup_members_inner(&v.members);
                }
                Some(PhoneCall(ref mut v)) => {
                    v.members = fixup_members_inner(&v.members);
                }
                _ => { /* NOOP*/ }
            }
        }
    }
    Ok(())
}

/// Change master message by setting all the following to that of slave message:
///
/// * Source message ID
/// * File name (if present)
///
///
/// Messages are assumed to be matching.
/// Rationale for file name is that newer version may reveal more accurate info.
fn update_with_slave_data(mm: &mut Message, sm: &Message) {
    mm.source_id_option = sm.source_id_option;
    match (mm.typed_mut(), sm.typed()) {
        (message::Typed::Regular(mmr), message::Typed::Regular(smr)) => {
            mmr.reply_to_message_id_option = smr.reply_to_message_id_option;

            if let (Some(mfn_ref), Some(sfn)) = (
                mmr.content_option.as_mut().and_then(|c| c.file_name_ref_mut()),
                smr.content_option.as_ref().and_then(|c| c.file_name())
            ) {
                *mfn_ref = Some(sfn.clone());
            }
        }
        (message::Typed::Service(mms), message::Typed::Service(sms)) => {
            use message_service::SealedValueOptional::*;
            match (mms.sealed_value_optional.as_mut(), sms.sealed_value_optional.as_ref()) {
                (Some(PinMessage(mmsv)), Some(PinMessage(smsv))) => mmsv.message_id = smsv.message_id,
                (_, _) => { /* NOOP */ }
            }
        }
        (_, _) => { unreachable!("Messages are supposed to be matching! {:?} vs {:?}", mm, sm) }
    }
}

/// Deduplicate profile pictures vec by content. Skips subsequent elements, ignoring framing.
fn dedup_profile_pics(profile_pics: Vec<AbsoluteProfilePicture>) -> Result<Vec<AbsoluteProfilePicture>> {
    let mut seen = HashSet::new();
    let mut res = Vec::with_capacity(profile_pics.len());
    for pp in profile_pics {
        match file_hash(&pp.absolute_path) {
            Ok(hash) => {
                if seen.insert(hash) {
                    res.push(pp);
                } // else NOOP
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => { /* NOOP */}
            Err(e) => return Err(e.into())
        }
    }
    Ok(res)
}

#[derive(Debug)]
pub enum UserMergeDecision {
    /// Only in master
    Retain(UserId),

    /// Only in slave, add
    Add(UserId),
    /// Only in slave, do not add
    DontAdd(UserId),

    /// Conflicts between master and slave, use slave
    Replace(UserId),
    /// Conflicts between master and slave - or they match, use master either way
    MatchOrDontReplace(UserId),
}

impl UserMergeDecision {
    pub fn master_user_id_option(&self) -> Option<UserId> {
        match self {
            UserMergeDecision::Retain(id) => Some(*id),
            UserMergeDecision::Add(_) => None,
            UserMergeDecision::DontAdd(_) => None,
            UserMergeDecision::Replace(id) => Some(*id),
            UserMergeDecision::MatchOrDontReplace(id) => Some(*id),
        }
    }


    pub fn slave_user_id_option(&self) -> Option<UserId> {
        match self {
            UserMergeDecision::Retain(_) => None,
            UserMergeDecision::Add(id) => Some(*id),
            UserMergeDecision::DontAdd(id) => Some(*id),
            UserMergeDecision::Replace(id) => Some(*id),
            UserMergeDecision::MatchOrDontReplace(id) => Some(*id),
        }
    }
}

#[derive(Debug)]
pub enum ChatMergeDecision {
    /// Only in master
    Retain { master_chat_id: ChatId },
    /// Only in slave, add
    Add { slave_chat_id: ChatId },
    /// Only in slave, do not add
    DontAdd { slave_chat_id: ChatId },
    /// Exists in both, act according to message merge decisions
    Merge { chat_id: ChatId, message_merges: Vec<MessagesMergeDecision> },
    /// Exists in both, keep master
    DontMerge { chat_id: ChatId },
}

impl ChatMergeDecision {
    fn master_chat_id_option(&self) -> Option<ChatId> {
        match self {
            ChatMergeDecision::Retain { master_chat_id } => Some(*master_chat_id),
            ChatMergeDecision::Add { .. } => None,
            ChatMergeDecision::DontAdd { .. } => None,
            ChatMergeDecision::Merge { chat_id, .. } => Some(*chat_id),
            ChatMergeDecision::DontMerge { chat_id } => Some(*chat_id),
        }
    }

    fn slave_chat_id_option(&self) -> Option<ChatId> {
        match self {
            ChatMergeDecision::Retain { .. } => None,
            ChatMergeDecision::Add { slave_chat_id } => Some(*slave_chat_id),
            ChatMergeDecision::DontAdd { slave_chat_id } => Some(*slave_chat_id),
            ChatMergeDecision::Merge { chat_id, .. } => Some(*chat_id),
            ChatMergeDecision::DontMerge { chat_id } => Some(*chat_id),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum MessagesMergeDecision {
    /// Same in master and slave
    Match(MergeAnalysisSectionMatch),

    /// Only in master
    Retain(MergeAnalysisSectionRetention),

    /// Only in slave, add
    Add(MergeAnalysisSectionAddition),
    /// Only in slave, do not add
    DontAdd(MergeAnalysisSectionAddition),

    /// Conflicts between master and slave, use slave
    Replace(MergeAnalysisSectionConflict),
    /// Conflicts between master and slave, use master
    DontReplace(MergeAnalysisSectionConflict),
}
