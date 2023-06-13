use std::fmt::{Display, Formatter};
use itertools::Itertools;

use history::*;

pub mod history;

pub type Id = i64;

#[derive(Debug, Clone, PartialEq)]
pub struct ShortUser {
    pub id: Id,
    pub full_name: Option<String>,
}

impl Display for ShortUser {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "ShortUser(id: {}, full_name: {:?})", self.id, self.full_name)
    }
}

impl ShortUser {
    pub fn new(id: Id, full_name: Option<String>) -> Self {
        Self { id, full_name }
    }

    pub fn new_name_str(id: Id, full_name: &str) -> Self {
        Self::new(id, Some(full_name.to_owned()))
    }

    pub fn default() -> Self {
        Self::new(-1, None)
    }

    pub fn to_user(&self, ds_uuid: &PbUuid) -> User {
        User {
            ds_uuid: Some(ds_uuid.clone()),
            id: self.id.clone(),
            first_name: self.full_name.clone(),
            last_name: None,
            username: None,
            phone_number: None,
        }
    }
}

pub fn unwrap_rich_text(rtes: &Vec<RichTextElement>) -> Vec<&rich_text_element::Val> {
    rtes.iter().map(|rte| rte.val.as_ref().unwrap()).collect_vec()
}

pub fn unwrap_rich_text_copy(rtes: &Vec<RichTextElement>) -> Vec<rich_text_element::Val> {
    unwrap_rich_text(rtes).into_iter().map(|v| v.clone()).collect_vec()
}