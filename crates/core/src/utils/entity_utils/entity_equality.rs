use std::collections::HashSet;

use super::*;
use crate::protobuf::history::*;
use crate::utils::files_are_equal;

/// Entity practical equality.
///
/// Practical equality is different from full equality like this:
/// 1. Internal IDs are ignored.
/// 2. External content paths might differ BUT the content itself must match.
/// 3. "Forwarded from" name is ignored (as its changes are not related to this message).
pub trait PracticalEq<Rhs/*: ?Sized*/ = Self> {
    fn practically_equals(&self, other: &Rhs) -> Result<bool>;
}

pub struct PracticalEqTuple<'a, T: 'a> {
    pub v: &'a T,
    pub ds_root: &'a DatasetRoot,
    pub cwd: Option<&'a ChatWithDetails>,
}

//
// General
//

type Tup<'a, T> = PracticalEqTuple<'a, T>;

impl<'a, T: 'a> Tup<'a, T> {
    pub fn new(v: &'a T, ds_root: &'a DatasetRoot, cwd: &'a ChatWithDetails) -> Self {
        Self { v, ds_root, cwd: Some(cwd) }
    }

    pub fn new_without_cwd(v: &'a T, ds_root: &'a DatasetRoot) -> Self {
        Self { v, ds_root, cwd: None }
    }

    pub fn with<U>(&self, u: &'a U) -> Tup<'a, U> {
        if let Some(cwd) = self.cwd {
            Tup::new(u, self.ds_root, cwd)
        } else {
            Tup::new_without_cwd(u, self.ds_root)
        }
    }

    pub fn apply<U>(&self, f: fn(&T) -> &U) -> Tup<'a, U> {
        if let Some(cwd) = self.cwd {
            Tup::new(f(self.v), self.ds_root, cwd)
        } else {
            Tup::new_without_cwd(f(self.v), self.ds_root)
        }
    }
}

/// Since equality for String is equality for path, two missing paths are equal even if one of them is None
impl PracticalEq for Tup<'_, Option<String>> {
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        lazy_static! { static ref MISSING: String = String::from("[MISSING]"); }
        let lhs = self.with(self.v.as_ref().unwrap_or(&MISSING));
        let rhs = other.with(other.v.as_ref().unwrap_or(&MISSING));
        lhs.practically_equals(&rhs)
    }
}

impl<'a, T> PracticalEq for PracticalEqTuple<'a, Vec<T>>
where
        for<'b> PracticalEqTuple<'a, T>: PracticalEq,
{
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        if self.v.len() != other.v.len() {
            return Ok(false);
        }
        for (v1, v2) in self.v.iter().zip(other.v.iter()) {
            if !self.with(v1).practically_equals(&other.with(v2))? {
                return Ok(false);
            }
        }
        Ok(true)
    }
}

macro_rules! default_option_equality {
    ($T:ident) => {
        impl<'a> PracticalEq for Tup<'a, Option<$T>> {
            fn practically_equals(&self, other: &Self) -> Result<bool> {
                match (self.v, other.v) {
                    (None, None) => Ok(true),
                    (Some(v1), Some(v2)) => self.with(v1).practically_equals(&other.with(v2)),
                    _ => Ok(false),
                }
            }
        }
    };
}

default_option_equality!(ContentPhoto);

macro_rules! cloned_equals_without {
    ($v1:expr, $v2:expr, $T:ident, $($key:ident : $val:expr),+) => {
        $T { $( $key: $val, )* ..(*$v1).clone() } == $T { $( $key: $val, )* ..(*$v2).clone() }
    };
}

//
// User
//

impl PracticalEq for Tup<'_, User> {
    /// Note that we do NOT check profile pictures here!
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        Ok(cloned_equals_without!(self.v, other.v, User, profile_pictures: vec![]))
    }
}

//
// Chat
//

impl PracticalEq for Tup<'_, Chat> {
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        Ok(cloned_equals_without!(self.v, other.v, Chat, img_path_option: None, member_ids: vec![]) &&
            self.v.member_ids.len() == other.v.member_ids.len() &&
            self.v.member_ids.iter().all(|e| other.v.member_ids.contains(e)) &&
            self.apply(|v| &v.img_path_option).practically_equals(&other.apply(|v| &v.img_path_option))?)
    }
}

//
//  Message
//

impl PracticalEq for Tup<'_, Message> {
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        Ok(cloned_equals_without!(self.v, other.v, Message,
                                  internal_id: 0,
                                  source_id_option: None,
                                  searchable_string: "".to_owned(),
                                  typed: None) &&
            self.apply(|v| v.typed()).practically_equals(&other.apply(|v| v.typed()))?)
    }
}

impl PracticalEq for Tup<'_, message::Typed> {
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        use message::Typed::*;
        match (self.v, other.v) {
            (Regular(c1), Regular(c2)) => self.with(c1).practically_equals(&other.with(c2)),
            (Service(c1), Service(c2)) => self.with(c1).practically_equals(&other.with(c2)),
            _ => Ok(false)
        }
    }
}

impl PracticalEq for Tup<'_, MessageRegular> {
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        Ok(cloned_equals_without!(self.v, other.v, MessageRegular, forward_from_name_option: None, contents: vec![]) &&
            self.apply(|v| &v.contents).practically_equals(&other.apply(|v| &v.contents))?)
    }
}

impl PracticalEq for Tup<'_, MessageService> {
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        use message_service::SealedValueOptional::*;
        macro_rules! case {
            ($T:ident, $name1:ident, $name2:ident) => { (Some($T($name1)), Some($T($name2))) };
        }
        let self_cwd = self.cwd.expect("CWD for MessageService is required");
        let other_cwd = other.cwd.expect("CWD for MessageService is required");
        match (self.v.sealed_value_optional.as_ref(), other.v.sealed_value_optional.as_ref()) {
            case!(PhoneCall, c1, c2) => {
                Ok(c1 == c2 &&
                    members_practically_equals((&c1.members, self_cwd), (&c2.members, other_cwd))?)
            }
            case!(SuggestProfilePhoto, c1, c2) => {
                // Only need to compare photos
                self.with(c1).apply(|c| &c.photo).practically_equals(&other.with(c2).apply(|c| &c.photo))
            }
            case!(PinMessage, c1, c2) => Ok(c1 == c2),
            case!(ClearHistory, c1, c2) => Ok(c1 == c2),
            case!(BlockUser, c1, c2) => Ok(c1 == c2),
            case!(StatusTextChanged, c1, c2) => Ok(c1 == c2),
            case!(Notice, c1, c2) => Ok(c1 == c2),
            case!(GroupCreate, c1, c2) =>
                Ok(c1.title == c2.title &&
                    members_practically_equals((&c1.members, self_cwd), (&c2.members, other_cwd))?),
            case!(GroupEditTitle, c1, c2) => Ok(c1 == c2),
            case!(GroupEditPhoto, c1, c2) => {
                // Only need to compare photos
                self.with(c1).apply(|c| &c.photo).practically_equals(&other.with(c2).apply(|c| &c.photo))
            }
            case!(GroupDeletePhoto, c1, c2) => Ok(c1 == c2),
            case!(GroupInviteMembers, c1, c2) =>
                members_practically_equals((&c1.members, self_cwd), (&c2.members, other_cwd)),
            case!(GroupRemoveMembers, c1, c2) =>
                members_practically_equals((&c1.members, self_cwd), (&c2.members, other_cwd)),
            case!(GroupMigrateFrom, c1, c2) => Ok(c1 == c2),
            case!(GroupMigrateTo, c1, c2) => Ok(c1 == c2),

            _ => Ok(false)
        }
    }
}

//
// Content
//

impl PracticalEq for Tup<'_, Content> {
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        use content::SealedValueOptional::*;
        match (self.v.sealed_value_optional.as_ref(), other.v.sealed_value_optional.as_ref()) { // @formatter:off
            (Some(Sticker(c1)),       Some(Sticker(c2)))       => self.with(c1).practically_equals(&other.with(c2)),
            (Some(Photo(c1)),         Some(Photo(c2)))         => self.with(c1).practically_equals(&other.with(c2)),
            (Some(VoiceMsg(c1)),      Some(VoiceMsg(c2)))      => self.with(c1).practically_equals(&other.with(c2)),
            (Some(Audio(c1)),         Some(Audio(c2)))         => self.with(c1).practically_equals(&other.with(c2)),
            (Some(VideoMsg(c1)),      Some(VideoMsg(c2)))      => self.with(c1).practically_equals(&other.with(c2)),
            (Some(Video(c1)),         Some(Video(c2)))         => self.with(c1).practically_equals(&other.with(c2)),
            (Some(File(c1)),          Some(File(c2)))          => self.with(c1).practically_equals(&other.with(c2)),
            (Some(Location(c1)),      Some(Location(c2)))      => self.with(c1).practically_equals(&other.with(c2)),
            (Some(Poll(c1)),          Some(Poll(c2)))          => self.with(c1).practically_equals(&other.with(c2)),
            (Some(SharedContact(c1)), Some(SharedContact(c2))) => self.with(c1).practically_equals(&other.with(c2)),
            (Some(TodoList(c1)),      Some(TodoList(c2))) => self.with(c1).practically_equals(&other.with(c2)),
            _ => Ok(false)
        } // @formatter:on
    }
}

/// Treating String as a relative path here.
/// (Cannot use newtype idiom - there's nobody to own the value)
impl PracticalEq for Tup<'_, String> {
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        files_are_equal(&self.ds_root.0.join(self.v), &other.ds_root.0.join(other.v))
    }
}

macro_rules! practical_eq_with_path {
    ($T:ident, [$($path:ident),+], [$($ignore:ident),*]) => {
        impl<'a> PracticalEq for Tup<'a, $T> {
            fn practically_equals(&self, other: &Self) -> Result<bool> {
                Ok($( self.apply(|v| &v.$path).practically_equals(&other.apply(|v| &v.$path))? && )*
                    $T {
                        $( $path: None, )*
                        $( $ignore: None, )*
                        ..(*self.v).clone()
                    } == $T {
                        $( $path: None, )*
                        $( $ignore: None, )*
                        ..(*other.v).clone()
                    })
            }
        }
    };
}

practical_eq_with_path!(ContentSticker, [path_option, thumbnail_path_option], [file_name_option]);
practical_eq_with_path!(ContentPhoto, [path_option], []);
practical_eq_with_path!(ContentVoiceMsg, [path_option], [file_name_option]);
practical_eq_with_path!(ContentAudio, [path_option], [file_name_option]);
practical_eq_with_path!(ContentVideoMsg, [path_option, thumbnail_path_option], [file_name_option]);
practical_eq_with_path!(ContentVideo, [path_option, thumbnail_path_option], [file_name_option]);
practical_eq_with_path!(ContentFile, [path_option, thumbnail_path_option], [file_name_option]);
practical_eq_with_path!(ContentSharedContact, [vcard_path_option], []);

impl PracticalEq for Tup<'_, ContentPoll> {
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        // We don't really care about poll result
        Ok(self.v == other.v)
    }
}

impl PracticalEq for Tup<'_, ContentLocation> {
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        // lat/lon are strings, trailing zeros should be ignored,
        Ok(self.v.lat()? == other.v.lat()? && self.v.lon()? == other.v.lon()? &&
            cloned_equals_without!(self.v, other.v, ContentLocation, lat_str: "".to_owned(), lon_str: "".to_owned()))
    }
}

impl PracticalEq for Tup<'_, ContentTodoList> {
    fn practically_equals(&self, other: &Self) -> Result<bool> {
        Ok(self.v.title_option == other.v.title_option &&
           self.v.items.len() == other.v.items.len() &&
           self.v.items.iter().zip(other.v.items.iter()).all(|(item1, item2)| item1 == item2))
    }
}

//
// Helper functions
//

fn members_practically_equals((members1, cwd1): (&[String], &ChatWithDetails),
                              (members2, cwd2): (&[String], &ChatWithDetails)) -> Result<bool> {
    fn resolve_ids_set(members: &[String], cwd: &ChatWithDetails) -> HashSet<Option<i64>> {
        HashSet::from_iter(cwd.resolve_members(members).iter().map(|o| o.map(|u| u.id)))
    }
    let members1 = resolve_ids_set(members1, cwd1);
    let members2 = resolve_ids_set(members2, cwd2);
    Ok(members1 == members2)
}
