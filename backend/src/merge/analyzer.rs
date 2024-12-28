use std::cmp::Ordering;

use itertools::Itertools;

use crate::dao::ChatHistoryDao;
use crate::prelude::*;

#[cfg(test)]
#[path = "analyzer_tests.rs"]
mod tests;

pub struct DatasetDiffAnalyzer<'a> {
    m_dao: &'a dyn ChatHistoryDao,
    m_root: DatasetRoot,

    s_dao: &'a dyn ChatHistoryDao,
    s_root: DatasetRoot,
}

impl<'a> DatasetDiffAnalyzer<'a> {
    pub fn create(
        m_dao: &'a dyn ChatHistoryDao,
        m_ds: &'a Dataset,
        s_dao: &'a dyn ChatHistoryDao,
        s_ds: &'a Dataset,
    ) -> Result<Self> {
        let m_root = m_dao.dataset_root(&m_ds.uuid)?;
        let s_root = s_dao.dataset_root(&s_ds.uuid)?;
        Ok(DatasetDiffAnalyzer { m_dao, m_root, s_dao, s_root })
    }

    /// Note that we can only detect conflicts if data source supports source IDs.
    /// If `force_conflicts` is set, everything starting at first mismatch and ending just before trailing match
    /// (if any) will be merged into a single conflict if possible
    pub fn analyze(
        &self,
        master_cwd: &ChatWithDetails,
        slave_cwd: &ChatWithDetails,
        title: &str,
        force_conflicts: bool,
    ) -> Result<Vec<MergeAnalysisSection>> {
        measure(|| {
            let mut analysis = self.analyze_inner(
                AnalysisContext {
                    mm_stream: messages_stream(self.m_dao, &master_cwd.chat, MasterMessage, |m| m.0.internal_id())?,
                    m_cwd: master_cwd,
                    sm_stream: messages_stream(self.s_dao, &slave_cwd.chat, SlaveMessage, |m| m.0.internal_id())?,
                    s_cwd: slave_cwd,
                }
            )?;
            if force_conflicts {
                analysis = enforce_conflicts(analysis)?;
            }
            Ok(analysis)
        }, |_, t| log::info!("Chat {title} analyzed in {t} ms"))
    }

    fn analyze_inner(&self, mut cx: AnalysisContext) -> Result<Vec<MergeAnalysisSection>> {
        use AnalysisState::*;
        use InProgressState::*;

        let mut state = NoState;
        let mut acc: Vec<MergeAnalysisSection> = vec![];

        let matches = |mm: &MasterMessage, sm: &SlaveMessage|
            equals_with_no_mismatching_content(PracticalEqTuple::new(mm, &self.m_root, cx.m_cwd),
                                               PracticalEqTuple::new(sm, &self.s_root, cx.s_cwd));
        loop {
            match (cx.peek(), &state) {
                //
                // NoState
                //

                ((Some(mm), Some(sm)), NoState) if matches(mm, sm)? => {
                    let (mm, sm) = cx.advance_both()?;
                    let mm_internal_id = mm.typed_id();
                    let sm_internal_id = sm.typed_id();

                    // Matching subsequence starts
                    state = InProgress(Match {
                        first_master_msg_id: mm_internal_id,
                        first_slave_msg_id: sm_internal_id,
                    });
                }

                // (Some(mm), Some(sm), NoState)
                // if mm.typed.service.flatten.flatMap(_.asMessage.sealedValueOptional.groupMigrateFrom).isDefined &&
                //     sm.typed.service.flatten.flatMap(_.asMessage.sealedValueOptional.groupMigrateFrom).isDefined &&
                //     mm.sourceIdOption.isDefined && mm.sourceIdOption == sm.sourceIdOption &&
                //     mm.fromId < 0x100000000L && sm.fromId > 0x100000000L &&
                //     (mm.copy(fromId = sm.fromId), masterRoot, cxt.mCwd) =~ = (sm, slaveRoot, cxt.sCwd) =>
                //
                // // // Special handling for a service message mismatch which is expected when merging Telegram after 2020-10
                // // // We register this one conflict and proceed in clean state.
                // // // This is dirty but relatively easy to do.
                // // val singleConflictState = ConflictInProgress(cxt.prevMm, mm, cxt.prevSm, sm)
                // // onDiffEnd(concludeDiff(cxt.advanceBoth(), singleConflictState))
                // // iterate(cxt.advanceBoth(), NoState, onDiffEnd)

                ((Some(mm), Some(sm)), NoState) if mm.source_id_option.is_some() && mm.source_id_option == sm.source_id_option => {
                    // Checking if there's a timestamp shift
                    {
                        let is_timestamp_diff = {
                            let mut mm = mm.clone();
                            mm.0.timestamp = sm.timestamp;
                            matches(&mm, sm)?
                        };
                        if is_timestamp_diff {
                            let (ahead_behind, diff_sec) = {
                                let ts_diff = sm.timestamp - mm.timestamp;
                                if ts_diff > 0 {
                                    ("ahead of", ts_diff)
                                } else {
                                    ("behind", -ts_diff)
                                }
                            };
                            let diff_hrs = diff_sec / 3600;

                            bail!("Time shift detected between datasets! Slave is {} master by {} sec ({} hrs)",
                                ahead_behind, diff_sec, diff_hrs);
                        }
                    }

                    // Conflict started
                    // (Conflicts are only detectable if data source supply source IDs)

                    let (mm, sm) = cx.advance_both()?;
                    let mm_internal_id = mm.typed_id();
                    let sm_internal_id = sm.typed_id();
                    log::debug!("Conflict started:\nWas    {:?}\nBecame {:?}", *mm, *sm);
                    state = InProgress(Conflict {
                        first_master_msg_id: mm_internal_id,
                        first_slave_msg_id: sm_internal_id,
                    });
                }

                ((_, Some(_sm)), NoState) if cx.cmp_master_slave().is_gt() => {
                    // Addition started
                    let sm = cx.advance_slave()?;
                    let sm_internal_id = sm.typed_id();
                    state = InProgress(Addition {
                        first_slave_msg_id: sm_internal_id,
                    });
                }

                ((Some(_mm), _), NoState) if cx.cmp_master_slave().is_lt() => {
                    // Retention started
                    let mm = cx.advance_master()?;
                    let mm_internal_id = mm.typed_id();
                    state = InProgress(Retention {
                        first_master_msg_id: mm_internal_id,
                    });
                }

                //
                // Match continues
                //

                ((Some(mm), Some(sm)), InProgress(Match { .. })) if matches(mm, sm)? => {
                    cx.advance_both()?;
                }

                //
                // Addition continues
                //

                ((_, Some(_sm)), InProgress(Addition { .. }))
                if /*state.prev_master_msg_option == cx.prev_mm &&*/ cx.cmp_master_slave().is_gt() => {
                    cx.advance_slave()?;
                }


                //
                // Retention continues
                //

                ((Some(_mm), _), _state @ InProgress(Retention { .. }))
                if /*cx.prev_sm == prevSlaveMsgOption &&*/ cx.cmp_master_slave().is_lt() => {
                    cx.advance_master()?;
                }

                //
                // Conflict continues
                //

                ((Some(mm), Some(sm)), InProgress(Conflict { .. })) if !matches(mm, sm)? => {
                    cx.advance_both()?;
                }

                //
                // Section ended
                //

                ((_, _), InProgress(inner_state)) => {
                    acc.push(inner_state.make_section(
                        cx.mm_stream.last_id_option, cx.sm_stream.last_id_option));
                    state = NoState;
                }

                //
                // Streams ended
                //

                ((None, None), NoState) =>
                    break,

                ((mm, sm), NoState) =>
                    panic!("Unexpected state! ({:?}, {:?}, NoState)", mm, sm),
            }
        };

        Ok(acc)
    }
}

/// Everything starting at first mismatch and ending just before trailing match (if any) will be merged into
/// a single conflict if possible
fn enforce_conflicts(analysis: Vec<MergeAnalysisSection>) -> Result<Vec<MergeAnalysisSection>> {
    macro_rules! is_match { ($expr:expr) => { matches!($expr, MergeAnalysisSection::Match(_)) }; }
    if analysis.len() <= 1 || analysis.iter().all(|a| is_match!(a)) {
        return Ok(analysis);
    }
    let start_idx_inc = analysis.iter().position(|a| !is_match!(a)).unwrap_or_default();
    let end_idx_exc = if is_match!(analysis.last().unwrap()) {
        analysis.len() - 1
    } else {
        analysis.len()
    };

    let mut first_master_msg_id = None;
    let mut last_master_msg_id = None;
    let mut first_slave_msg_id = None;
    let mut last_slave_msg_id = None;
    macro_rules! set_option {
        ($opt_name:ident, $v:ident, $only_if_empty:literal) => {
            if !$only_if_empty || $opt_name.is_none() { $opt_name = Some($v.$opt_name); }
        };
    }

    for analysis_entry in &analysis[start_idx_inc..end_idx_exc] {
        match analysis_entry {
            MergeAnalysisSection::Match(v) => {
                set_option!(first_master_msg_id, v, true);
                set_option!(last_master_msg_id, v, false);
                set_option!(first_slave_msg_id, v, true);
                set_option!(last_slave_msg_id, v, false);
            }
            MergeAnalysisSection::Retention(v) => {
                set_option!(first_master_msg_id, v, true);
                set_option!(last_master_msg_id, v, false);
            }
            MergeAnalysisSection::Addition(v) => {
                set_option!(first_slave_msg_id, v, true);
                set_option!(last_slave_msg_id, v, false);
            }
            MergeAnalysisSection::Conflict(v) => {
                set_option!(first_master_msg_id, v, true);
                set_option!(last_master_msg_id, v, false);
                set_option!(first_slave_msg_id, v, true);
                set_option!(last_slave_msg_id, v, false);
            }
        }
    }

    match (first_master_msg_id, last_master_msg_id, first_slave_msg_id, last_slave_msg_id) {
        (Some(first_master_msg_id), Some(last_master_msg_id), Some(first_slave_msg_id), Some(last_slave_msg_id)) => {
            let conflict = MergeAnalysisSection::Conflict(MergeAnalysisSectionConflict {
                first_master_msg_id,
                last_master_msg_id,
                first_slave_msg_id,
                last_slave_msg_id,
            });
            let mut analysis = analysis;
            analysis.splice(start_idx_inc..end_idx_exc, vec![conflict]);
            Ok(analysis)
        }
        _ => Ok(analysis)
    }
}

#[derive(Debug)]
enum AnalysisState {
    NoState,
    InProgress(InProgressState),
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum InProgressState {
    Match {
        first_master_msg_id: MasterInternalId,
        first_slave_msg_id: SlaveInternalId,
    },
    Retention {
        first_master_msg_id: MasterInternalId,
    },
    Addition {
        first_slave_msg_id: SlaveInternalId,
    },
    Conflict {
        first_master_msg_id: MasterInternalId,
        first_slave_msg_id: SlaveInternalId,
    },
}

impl InProgressState {
    fn make_section(&self, mm_id: Option<MasterInternalId>, sm_id: Option<SlaveInternalId>) -> MergeAnalysisSection {
        use MergeAnalysisSection::*;
        match *self {
            InProgressState::Match { first_master_msg_id, first_slave_msg_id } => Match(MergeAnalysisSectionMatch {
                first_master_msg_id,
                last_master_msg_id: mm_id.unwrap(),
                first_slave_msg_id,
                last_slave_msg_id: sm_id.unwrap(),
            }),
            InProgressState::Retention { first_master_msg_id } => Retention(MergeAnalysisSectionRetention {
                first_master_msg_id,
                last_master_msg_id: mm_id.unwrap(),
            }),
            InProgressState::Addition { first_slave_msg_id } => Addition(MergeAnalysisSectionAddition {
                first_slave_msg_id,
                last_slave_msg_id: sm_id.unwrap(),
            }),
            InProgressState::Conflict { first_master_msg_id, first_slave_msg_id } => Conflict(MergeAnalysisSectionConflict {
                first_master_msg_id,
                last_master_msg_id: mm_id.unwrap(),
                first_slave_msg_id,
                last_slave_msg_id: sm_id.unwrap(),
            }),
        }
    }
}

// Since we can't use enums variants as types as of yet (https://github.com/rust-lang/rfcs/issues/754),
// we're using nested structures as types instead.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MergeAnalysisSection {
    Match(MergeAnalysisSectionMatch),
    Retention(MergeAnalysisSectionRetention),
    Addition(MergeAnalysisSectionAddition),
    Conflict(MergeAnalysisSectionConflict),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MergeAnalysisSectionMatch {
    pub first_master_msg_id: MasterInternalId,
    pub last_master_msg_id: MasterInternalId,
    pub first_slave_msg_id: SlaveInternalId,
    pub last_slave_msg_id: SlaveInternalId,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MergeAnalysisSectionRetention {
    pub first_master_msg_id: MasterInternalId,
    pub last_master_msg_id: MasterInternalId,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MergeAnalysisSectionAddition {
    pub first_slave_msg_id: SlaveInternalId,
    pub last_slave_msg_id: SlaveInternalId,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MergeAnalysisSectionConflict {
    pub first_master_msg_id: MasterInternalId,
    pub last_master_msg_id: MasterInternalId,
    pub first_slave_msg_id: SlaveInternalId,
    pub last_slave_msg_id: SlaveInternalId,
}

struct AnalysisContext<'a> {
    mm_stream: BatchedMessageIterator<'a, MasterMessage>,
    m_cwd: &'a ChatWithDetails,

    sm_stream: BatchedMessageIterator<'a, SlaveMessage>,
    s_cwd: &'a ChatWithDetails,
}

impl AnalysisContext<'_> {
    fn cmp_master_slave(&self) -> Ordering {
        match self.peek() {
            (None, None) => Ordering::Equal,
            (None, _) => Ordering::Greater,
            (_, None) => Ordering::Less,
            (Some(mm), Some(sm)) => {
                if mm.timestamp != sm.timestamp {
                    mm.timestamp.cmp(&sm.timestamp)
                } else if mm.searchable_string == sm.searchable_string {
                    Ordering::Equal
                } else if let (Some(msrcid), Some(ssrcid)) = (mm.source_id_option, sm.source_id_option) {
                    msrcid.cmp(&ssrcid)
                } else {
                    panic!("Cannot compare messages {:?} and {:?}!", mm.0, sm.0)
                }
            }
        }
    }

    fn peek(&self) -> (Option<&MasterMessage>, Option<&SlaveMessage>) {
        (self.mm_stream.peek(), self.sm_stream.peek())
    }

    fn advance_both(&mut self) -> Result<(MasterMessage, SlaveMessage)> {
        Ok((self.advance_master()?, self.advance_slave()?))
    }

    fn advance_master(&mut self) -> Result<MasterMessage> {
        let next = self.mm_stream.next().expect("Empty master stream advanced! This should've been checked")?;
        assert_ne!(next.internal_id, *NO_INTERNAL_ID);
        Ok(next)
    }

    fn advance_slave(&mut self) -> Result<SlaveMessage> {
        let next = self.sm_stream.next().expect("Empty slave stream advanced! This should've been checked")?;
        assert_ne!(next.internal_id, *NO_INTERNAL_ID);
        Ok(next)
    }
}

const BATCH_SIZE: usize = 1000;

fn messages_stream<'a, T: WithTypedId>(
    dao: &'a dyn ChatHistoryDao,
    chat: &'a Chat,
    wrap: fn(Message) -> T,
    unwrap_id: fn(&T) -> MessageInternalId,
) -> Result<BatchedMessageIterator<'a, T>> {
    let mut res = BatchedMessageIterator {
        dao,
        chat,
        wrap,
        unwrap_id,
        saved_batch: dao.first_messages(chat, BATCH_SIZE)?.into_iter(),
        next_option: None,
        last_id_option: None,
    };
    res.next_option = res.saved_batch.next().map(res.wrap);
    Ok(res)
}

struct BatchedMessageIterator<'a, T: WithTypedId> {
    dao: &'a dyn ChatHistoryDao,
    chat: &'a Chat,
    wrap: fn(Message) -> T,
    unwrap_id: fn(&T) -> MessageInternalId,
    saved_batch: std::vec::IntoIter<Message>,
    next_option: Option<T>,
    last_id_option: Option<T::Item>,
}

impl<'a, T: WithTypedId> BatchedMessageIterator<'a, T> {
    fn peek(&self) -> Option<&T> {
        self.next_option.as_ref()
    }
}

impl<'a, T: WithTypedId> Iterator for BatchedMessageIterator<'a, T> {
    type Item = Result<T>;

    fn next(&mut self) -> Option<Self::Item> {
        let current = self.next_option.take();
        if let Some(ref current) = current {
            match self.saved_batch.next() {
                Some(next) => {
                    // Iterator still has elements, cache it and be happy.
                    self.next_option = Some((self.wrap)(next));
                }
                None => {
                    // Iterator exhausted, time to preload next batch.
                    let msgs = self.dao.messages_after(self.chat, (self.unwrap_id)(current), BATCH_SIZE + 1);
                    match msgs {
                        Ok(msgs) => {
                            self.saved_batch = msgs.into_iter();
                            self.next_option = self.saved_batch.next().map(self.wrap);
                        }
                        Err(e) => return Some(Err(e))
                    }
                }
            }
        } // Otherwise iterator ended, no more elements.
        self.last_id_option = current.as_ref().map(|m| m.typed_id());
        current.map(|c| Ok(c))
    }
}

/**
 * Equality test, but treats master and slave messages as equal if either of them has content - unless they both do
 * and it's mismatching.
 * Also ignores edit timestamp if nothing else is changed.
 */
fn equals_with_no_mismatching_content(mm_eq: PracticalEqTuple<MasterMessage>,
                                      sm_eq: PracticalEqTuple<SlaveMessage>) -> Result<bool> {
    use message::Typed::*;
    use message_service::SealedValueOptional::*;

    // Special case: Telegram 2023-11 started exporting double styles (bold+X)
    // as bold instead of an X. We want to ignore this change.
    fn text_to_comparable(rte: &RichTextElement) -> RichTextElement {
        use rich_text_element::Val::*;
        match rte.val {
            Some(Italic(ref v)) => RichText::make_bold(v.text.clone()),
            Some(Underline(ref v)) => RichText::make_bold(v.text.clone()),
            Some(Strikethrough(ref v)) => RichText::make_bold(v.text.clone()),
            _ => rte.clone()
        }
    }
    fn regular_msg_to_comparable(m: &Message, mr: &MessageRegular) -> Message {
        Message {
            typed: Some(message_regular! {
                contents: vec![],
                edit_timestamp_option: None,
                reply_to_message_id_option: None,
                ..mr.clone()
            }),
            text: m.text.iter().map(text_to_comparable).collect_vec(),
            ..m.clone()
        }
    }
    fn has_some_content(c: &[Content], root: &DatasetRoot) -> bool {
        c.iter().flat_map(|c| c.path_file_option(root))
            .any(|p| p.exists())
    }
    fn photo_has_content(photo: &ContentPhoto, root: &DatasetRoot) -> bool {
        photo.path_option.as_ref()
            .map(|path| root.to_absolute(path).exists())
            .unwrap_or(false)
    }
    let mm_eq_sm = || mm_eq.apply(|m| &m.0).practically_equals(&sm_eq.apply(|m| &m.0));

    match (mm_eq.v.0.typed(), sm_eq.v.0.typed()) {
        (Regular(mm_regular), Regular(sm_regular)) => {
            let mm_copy = regular_msg_to_comparable(&mm_eq.v.0, mm_regular);
            let sm_copy = regular_msg_to_comparable(&sm_eq.v.0, sm_regular);

            if !mm_eq.with(&mm_copy).practically_equals(&sm_eq.with(&sm_copy))? {
                return Ok(false);
            }

            if !has_some_content(&mm_regular.contents, mm_eq.ds_root) ||
                !has_some_content(&sm_regular.contents, sm_eq.ds_root) {
                return Ok(true);
            }

            mm_eq.with(&mm_regular.contents).practically_equals(&sm_eq.with(&sm_regular.contents))
        }
        (message_service_pat!(GroupEditPhoto(MessageServiceGroupEditPhoto { photo: mm_photo })),
            message_service_pat!(GroupEditPhoto(MessageServiceGroupEditPhoto { photo: sm_photo }))) => {
            if !photo_has_content(mm_photo, mm_eq.ds_root) || !photo_has_content(sm_photo, sm_eq.ds_root) {
                return Ok(true);
            }
            mm_eq_sm()
        }
        (message_service_pat!(SuggestProfilePhoto(MessageServiceSuggestProfilePhoto { photo: mm_photo })),
            message_service_pat!(SuggestProfilePhoto(MessageServiceSuggestProfilePhoto { photo: sm_photo }))) => {
            if !photo_has_content(mm_photo, mm_eq.ds_root) || !photo_has_content(sm_photo, sm_eq.ds_root) {
                return Ok(true);
            }
            mm_eq_sm()
        }
        _ => mm_eq_sm()
    }
}
