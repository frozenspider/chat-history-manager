pub use chat_history_manager_dao::utils::test_utils::*;

use chat_history_manager_core::protobuf::history::*;
use chat_history_manager_core::utils::entity_utils::*;

use rand::Rng;

//
// Entity creation helpers
//

pub struct MergerHelper {
    pub m: DaoEntities<MasterMessage>,
    pub s: DaoEntities<SlaveMessage>,
}

impl MergerHelper {
    pub fn random_user_id(max: usize) -> usize {
        rng().random_range(1..=max)
    }

    pub fn new_as_is(num_users: usize,
                     msgs1: Vec<Message>,
                     msgs2: Vec<Message>) -> Self {
        let seed = 0;
        Self::new(num_users, msgs1, msgs2, &|_, _, _| {}, seed, seed)
    }

    pub fn new(num_users: usize,
               msgs1: Vec<Message>,
               msgs2: Vec<Message>,
               amend_message: &impl Fn(bool, &DatasetRoot, &mut Message),
               m_seed: u64,
               s_seed: u64) -> Self {
        let m_dao = create_simple_dao(true, "One", msgs1, num_users, amend_message, m_seed);
        let s_dao = create_simple_dao(false, "Two", msgs2, num_users, amend_message, s_seed);
        Self::new_from_daos(m_dao, s_dao)
    }

    pub fn new_from_daos(m_dao: InMemoryDaoHolder, s_dao: InMemoryDaoHolder) -> Self {
        let m = get_simple_dao_entities(m_dao, MasterMessage);
        let s = get_simple_dao_entities(s_dao, SlaveMessage);
        MergerHelper { m, s }
    }
}
