use std::borrow::Cow;
use std::collections::HashSet;
use std::hash::Hash;
use super::*;
use crate::protobuf::history::*;
use crate::protobuf::history::rich_text_element::Val::{Italic, Strikethrough, Underline};
use crate::utils::files_are_equal;

/// Entity practical comparison.
///
/// Practical equality is different from full equality like this:
/// * Internal IDs are ignored.
/// * External content paths are compared by file content, NOT by path.
/// * For content with path (photos, stickers, videos, etc), we compare only the files.
///   Metadata like file name is only compared if files match.
/// * "Forwarded from" name is ignored (as its changes are not related to this message).
/// * Edit timestamp is ignored (as it's not interesting unless something else changed too).
/// * Special case: Telegram 2023-11 started exporting double styles (bold+X) as bold instead of an X.
///   We want to ignore this change, so Italic, Underline and Strikethrough consideres equal to Bold.
pub trait EntityCmp<Rhs/*: ?Sized*/ = Self> {
    fn compare(&self, other: &Rhs) -> Result<Cmp>;
}

pub struct EntityCmpTuple<'a, T: 'a + ?Sized> {
    pub v: &'a T,
    pub ds_root: &'a DatasetRoot,
    pub cwd: Option<&'a ChatWithDetails>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntityCmpResult {
    /// Entities match exactly (according to [EntityCmp] rules)
    Equal,
    /// Entities contain conflicting data OR different parts of data is missing from both of them
    Conflict,
    /// Left entity has more data than right entity, otherwise they are equal
    LeftHasMore,
    /// Right entity has more data than left entity, otherwise they are equal
    RightHasMore,
}

impl EntityCmpResult {
    pub fn is_eq(self) -> bool {
        self == Self::Equal
    }

    pub fn is_conflict(self) -> bool {
        self == Self::Conflict
    }

    pub fn is_left_more(self) -> bool {
        self == Self::LeftHasMore
    }

    pub fn is_right_more(self) -> bool {
        self == Self::RightHasMore
    }

    pub fn chain<I: IntoIterator<Item = Self>>(vals: I) -> Self {
        let mut vals = vals.into_iter();
        let mut result = vals.next().unwrap();
        for val in vals {
            use EntityCmpResult::*;
            match (result, val) {
                (a, b) if a == b => { /* NOOP */ }
                (Equal, other) => {
                    // Other outcome is taken as-is
                    result = other;
                }
                (_, Equal) => { /* NOOP, result is left unaffected */ }
                (Conflict, _) | (_, Conflict) => {
                    // Conflict on either side means conflict in general
                    return Conflict;
                }
                (LeftHasMore, RightHasMore) | (RightHasMore, LeftHasMore) => {
                    // Both sides have more data in some regard
                    return Conflict;
                }
                (LeftHasMore, LeftHasMore) | (RightHasMore, RightHasMore) => {
                    unreachable!("Handled by first case")
                }
            }
        }
        result
    }
}

impl From<bool> for EntityCmpResult {
    fn from(b: bool) -> Self {
        if b { Self::Equal } else { Self::Conflict }
    }
}

//
// General
//

type Tup<'a, T> = EntityCmpTuple<'a, T>;
type Cmp = EntityCmpResult;

impl<'a, T: 'a + ?Sized> Tup<'a, T> {
    pub fn new(v: &'a T, ds_root: &'a DatasetRoot, cwd: &'a ChatWithDetails) -> Self {
        Self { v, ds_root, cwd: Some(cwd) }
    }

    pub fn new_without_cwd(v: &'a T, ds_root: &'a DatasetRoot) -> Self {
        Self { v, ds_root, cwd: None }
    }

    pub fn with<U>(&'a self, u: &'a U) -> Tup<'a, U> {
        if let Some(cwd) = self.cwd {
            Tup::new(u, self.ds_root, cwd)
        } else {
            Tup::new_without_cwd(u, self.ds_root)
        }
    }

    pub fn apply<U: ?Sized>(&'a self, f: fn(&'a T) -> &'a U) -> Tup<'a, U> {
        if let Some(cwd) = self.cwd {
            Tup::new(f(self.v), self.ds_root, cwd)
        } else {
            Tup::new_without_cwd(f(self.v), self.ds_root)
        }
    }
}

/// Since equality for String is equality for path, two missing paths are equal even if one of them is None
impl EntityCmp for Tup<'_, Option<String>> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        lazy_static! { static ref MISSING: String = String::from("[MISSING]"); }
        let lhs = self.with(self.v.as_ref().unwrap_or(&MISSING));
        let rhs = other.with(other.v.as_ref().unwrap_or(&MISSING));
        lhs.compare(&rhs)
    }
}

impl<'a, T> EntityCmp for EntityCmpTuple<'a, [T]>
where
    for<'b> EntityCmpTuple<'b, T>: EntityCmp,
{
    fn compare(&self, other: &Self) -> Result<Cmp> {
        compare_lists_res(self.v, other.v, |v1, v2| self.with(v1).compare(&other.with(v2)))
    }
}

macro_rules! default_option_comparison {
    ($T:ident) => {
        impl<'a> EntityCmp for Tup<'a, Option<$T>> {
            fn compare(&self, other: &Self) -> Result<Cmp> {
                match (self.v, other.v) {
                    (None, None) => Ok(Cmp::Equal),
                    (Some(v1), Some(v2)) => self.with(v1).compare(&other.with(v2)),
                    (Some(_), None) => Ok(Cmp::LeftHasMore),
                    (None, Some(_)) => Ok(Cmp::RightHasMore),
                }
            }
        }
    };
}

default_option_comparison!(ContentPhoto);

// TODO: Make this into a comparison?
macro_rules! cloned_equals_without {
    ($v1:expr, $v2:expr, $T:ident, $($key:ident : $val:expr),+) => {
        $T { $( $key: $val, )* ..(*$v1).clone() } == $T { $( $key: $val, )* ..(*$v2).clone() }
    };
}

//
// User
//

impl EntityCmp for Tup<'_, User> {
    /// Note that we do NOT check profile pictures here!
    fn compare(&self, other: &Self) -> Result<Cmp> {
        Ok(cloned_equals_without!(self.v, other.v, User, profile_pictures: vec![]).into())
    }
}

//
// Chat
//

impl EntityCmp for Tup<'_, Chat> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        Ok(Cmp::chain([
            cloned_equals_without!(self.v, other.v, Chat, img_path_option: None, member_ids: vec![]).into(),
            sets_are_equal(&self.v.member_ids, &other.v.member_ids).into(),
            self.apply(|v| &v.img_path_option).compare(&other.apply(|v| &v.img_path_option))?
        ]))
    }
}

//
//  Message
//

impl EntityCmp for Tup<'_, Message> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        Ok(Cmp::chain([
            cloned_equals_without!(self.v, other.v, Message,
                                  internal_id: 0,
                                  source_id_option: None,
                                  searchable_string: "".to_owned(),
                                  text: vec![],
                                  typed: None).into(),
            self.apply(|v| v.text.as_slice()).compare(&other.apply(|v| v.text.as_slice()))?,
            self.apply(|v| v.typed()).compare(&other.apply(|v| v.typed()))?
        ]))
    }
}

impl EntityCmp for Tup<'_, message::Typed> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        use message::Typed::*;
        match (self.v, other.v) {
            (Regular(c1), Regular(c2)) => self.with(c1).compare(&other.with(c2)),
            (Service(c1), Service(c2)) => self.with(c1).compare(&other.with(c2)),
            _ => Ok(Cmp::Conflict)
        }
    }
}

impl EntityCmp for Tup<'_, MessageRegular> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        Ok(Cmp::chain([
            cloned_equals_without!(self.v, other.v, MessageRegular,
                                   edit_timestamp_option: None,
                                   forward_from_name_option: None,
                                   reply_to_message_id_option: None,
                                   contents: vec![]).into(),
            self.apply(|v| v.contents.as_slice()).compare(&other.apply(|v| v.contents.as_slice()))?
        ]))
    }
}

impl EntityCmp for Tup<'_, MessageService> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        use message_service::SealedValueOptional::*;
        macro_rules! case {
            ($T:ident, $name1:ident, $name2:ident) => { (Some($T($name1)), Some($T($name2))) };
        }
        let self_cwd = self.cwd.expect("CWD for MessageService is required");
        let other_cwd = other.cwd.expect("CWD for MessageService is required");
        match (self.v.sealed_value_optional.as_ref(), other.v.sealed_value_optional.as_ref()) {
            case!(PhoneCall, c1, c2) => {
                Ok((cloned_equals_without!(c1, c2, MessageServicePhoneCall, members: vec![]) &&
                    members_practically_equals((&c1.members, self_cwd), (&c2.members, other_cwd))?).into())
            }
            case!(SuggestProfilePhoto, c1, c2) => {
                // Only need to compare photos
                self.with(c1).apply(|c| &c.photo).compare(&other.with(c2).apply(|c| &c.photo))
            }
            case!(PinMessage, c1, c2) => Ok((c1 == c2).into()),
            case!(ClearHistory, c1, c2) => Ok((c1 == c2).into()),
            case!(BlockUser, c1, c2) => Ok((c1 == c2).into()),
            case!(StatusTextChanged, c1, c2) => Ok((c1 == c2).into()),
            case!(Notice, c1, c2) => Ok((c1 == c2).into()),
            case!(GroupCreate, c1, c2) =>
                Ok((c1.title == c2.title &&
                    members_practically_equals((&c1.members, self_cwd), (&c2.members, other_cwd))?).into()),
            case!(GroupEditTitle, c1, c2) => Ok((c1 == c2).into()),
            case!(GroupEditPhoto, c1, c2) => {
                // Only need to compare photos
                self.with(c1).apply(|c| &c.photo).compare(&other.with(c2).apply(|c| &c.photo))
            }
            case!(GroupDeletePhoto, c1, c2) => Ok((c1 == c2).into()),
            case!(GroupInviteMembers, c1, c2) =>
                members_practically_equals((&c1.members, self_cwd), (&c2.members, other_cwd)).map(Cmp::from),
            case!(GroupRemoveMembers, c1, c2) =>
                members_practically_equals((&c1.members, self_cwd), (&c2.members, other_cwd)).map(Cmp::from),
            case!(GroupMigrateFrom, c1, c2) => Ok((c1 == c2).into()),
            case!(GroupMigrateTo, c1, c2) => Ok((c1 == c2).into()),
            _ => Ok(Cmp::Conflict)
        }
    }
}

//
// RTE
//

impl EntityCmp for Tup<'_, RichTextElement> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        fn to_comparable(rte: &RichTextElement) -> Option<Cow<'_, RichTextElement>> {
            // See note in `EntityCmp`
            match rte.val {
                Some(Italic(ref v)) => Some(Cow::Owned(RichText::make_bold(v.text.clone()))),
                Some(Underline(ref v)) => Some(Cow::Owned(RichText::make_bold(v.text.clone()))),
                Some(Strikethrough(ref v)) => Some(Cow::Owned(RichText::make_bold(v.text.clone()))),
                Some(_) => Some(Cow::Borrowed(rte)),
                None => None
            }
        }
        let v1 = to_comparable(&self.v);
        let v2 = to_comparable(&other.v);
        Ok((v1 == v2).into())
    }
}

//
// Content
//

impl EntityCmp for Tup<'_, Content> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        use content::SealedValueOptional::*;
        match (self.v.sealed_value_optional.as_ref(), other.v.sealed_value_optional.as_ref()) { // @formatter:off
            (Some(Sticker(c1)),       Some(Sticker(c2)))       => self.with(c1).compare(&other.with(c2)),
            (Some(Photo(c1)),         Some(Photo(c2)))         => self.with(c1).compare(&other.with(c2)),
            (Some(VoiceMsg(c1)),      Some(VoiceMsg(c2)))      => self.with(c1).compare(&other.with(c2)),
            (Some(Audio(c1)),         Some(Audio(c2)))         => self.with(c1).compare(&other.with(c2)),
            (Some(VideoMsg(c1)),      Some(VideoMsg(c2)))      => self.with(c1).compare(&other.with(c2)),
            (Some(Video(c1)),         Some(Video(c2)))         => self.with(c1).compare(&other.with(c2)),
            (Some(File(c1)),          Some(File(c2)))          => self.with(c1).compare(&other.with(c2)),
            (Some(Location(c1)),      Some(Location(c2)))      => self.with(c1).compare(&other.with(c2)),
            (Some(Poll(c1)),          Some(Poll(c2)))          => self.with(c1).compare(&other.with(c2)),
            (Some(SharedContact(c1)), Some(SharedContact(c2))) => self.with(c1).compare(&other.with(c2)),
            (Some(TodoList(c1)),      Some(TodoList(c2)))      => self.with(c1).compare(&other.with(c2)),
            _ => Ok(Cmp::Conflict),
        } // @formatter:on
    }
}

/// Treating String as a relative path here.
/// (Cannot use newtype idiom - there's nobody to own the value)
impl EntityCmp for Tup<'_, String> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        files_are_equal(&self.ds_root.0.join(self.v), &other.ds_root.0.join(other.v))
    }
}

macro_rules! cmp_eq_with_path {
    ($T:ident, [$($path:ident),+], [$($ignore:ident),*]) => {
        impl<'a> EntityCmp for Tup<'a, $T> {
            fn compare(&self, other: &Self) -> Result<Cmp> {
                // Compare files first. Only compare everything else if they match.
                let path_cmp = Cmp::chain([
                    $( self.apply(|v| &v.$path).compare(&other.apply(|v| &v.$path))?, )*
                ]);
                if path_cmp != Cmp::Equal {
                    return Ok(path_cmp);
                }
                Ok(
                    ($T {
                        $( $path: None, )*
                        $( $ignore: None, )*
                        ..(*self.v).clone()
                    } == $T {
                        $( $path: None, )*
                        $( $ignore: None, )*
                        ..(*other.v).clone()
                    }).into()
                )
            }
        }
    };
}

cmp_eq_with_path!(ContentSticker, [path_option, thumbnail_path_option], [file_name_option]);
cmp_eq_with_path!(ContentPhoto, [path_option], []);
cmp_eq_with_path!(ContentVoiceMsg, [path_option], [file_name_option]);
cmp_eq_with_path!(ContentAudio, [path_option], [file_name_option]);
cmp_eq_with_path!(ContentVideoMsg, [path_option, thumbnail_path_option], [file_name_option]);
cmp_eq_with_path!(ContentVideo, [path_option, thumbnail_path_option], [file_name_option]);
cmp_eq_with_path!(ContentFile, [path_option, thumbnail_path_option], [file_name_option]);
cmp_eq_with_path!(ContentSharedContact, [vcard_path_option], []);

impl EntityCmp for Tup<'_, ContentPoll> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        // We don't really care about poll result
        Ok((self.v == other.v).into())
    }
}

impl EntityCmp for Tup<'_, ContentLocation> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        // lat/lon are strings, trailing zeros should be ignored,
        // Longer lat/lon string should be considered more precise
        fn compare_lat_lon(v1: &str, v2: &str) -> Cmp {
            let v1 = v1.trim_end_matches('0').trim_end_matches('.');
            let v2 = v2.trim_end_matches('0').trim_end_matches('.');
            match (v1.len(), v2.len()) {
                (0, 0) => Cmp::Equal,
                (0, _) => Cmp::RightHasMore,
                (_, 0) => Cmp::LeftHasMore,
                (x, y) if x == y => Cmp::Equal,
                _ => {
                    // Drop the last digit and then compare substrings
                    let v1 = &v1[..v1.len() - 1];
                    let v2 = &v2[..v2.len() - 1];
                    if v1.contains(v2) {
                        Cmp::LeftHasMore
                    } else if v2.contains(v1) {
                        Cmp::RightHasMore
                    } else {
                        Cmp::Conflict
                    }
                }
            }
        }

        Ok(Cmp::chain([
            compare_lat_lon(&self.v.lat_str, &other.v.lat_str),
            compare_lat_lon(&self.v.lon_str, &other.v.lon_str),
            cloned_equals_without!(self.v, other.v, ContentLocation, lat_str: "".to_owned(), lon_str: "".to_owned()).into()
        ]))
    }
}

impl EntityCmp for Tup<'_, ContentTodoList> {
    fn compare(&self, other: &Self) -> Result<Cmp> {
        Ok(Cmp::chain([
            (self.v.title_option == other.v.title_option).into(),
            compare_lists(&self.v.items, &other.v.items, |item1, item2| (item1 == item2).into())
        ]))
    }
}

//
// Helper functions
//

fn members_practically_equals((members1, cwd1): (&[String], &ChatWithDetails),
                              (members2, cwd2): (&[String], &ChatWithDetails)) -> Result<bool> {
    // Short-circuit if both member slices have equal string representation
    if members1 == members2 {
        return Ok(true);
    }
    if members1.len() != members2.len() {
        return Ok(false);
    }
    fn resolve_ids_set(members: &[String], cwd: &ChatWithDetails) -> HashSet<Option<i64>> {
        HashSet::from_iter(cwd.resolve_members(members).iter().map(|o| o.map(|u| u.id)))
    }
    let members1 = resolve_ids_set(members1, cwd1);
    let members2 = resolve_ids_set(members2, cwd2);
    if members1 == members2 {
        return Ok(true);
    }
    // If some members have gone missing since last time, we still consider them equal
    let disappeared = members1.difference(&members2).filter_map(|id| *id).collect_vec();
    let appeared = members2.difference(&members1).filter_map(|id| *id).collect_vec();
    Ok(!disappeared.is_empty() && appeared.is_empty())
}

fn sets_are_equal<T: Hash + Eq>(list1: &[T], list2: &[T]) -> bool {
    if list1.len() != list2.len() {
        return false;
    }
    // Lists are expected to be pretty small, we don't bother creating sets for efficiency
    list1.iter().all(|v| list2.contains(v))
}

fn compare_lists<'a, T>(list1: &'a [T], list2: &'a [T], f: impl Fn(&'a T, &'a T) -> Cmp) -> Cmp {
    if list1.len() != list2.len() {
        return Cmp::Conflict;
    }
    let mut results = Vec::with_capacity(list1.len());
    for (v1, v2) in list1.iter().zip(list2.iter()) {
        results.push(f(v1, v2));
    }
    Cmp::chain(results)
}

fn compare_lists_res<'a, T>(list1: &'a [T], list2: &'a [T], f: impl for<'b> Fn(&'b T, &'b T) -> Result<Cmp>) -> Result<Cmp> {
    match (list1.len(), list2.len()) {
        (0, 0) => Ok(Cmp::Equal),
        (0, _) => Ok(Cmp::RightHasMore),
        (_, 0) => Ok(Cmp::LeftHasMore),
        (x, y) if x == y => {
            let mut results = Vec::with_capacity(list1.len());
            for (v1, v2) in list1.iter().zip(list2.iter()) {
                results.push(f(v1, v2)?);
            }
            Ok(Cmp::chain(results))
        }
        _ => Ok(Cmp::Conflict),
    }
}
