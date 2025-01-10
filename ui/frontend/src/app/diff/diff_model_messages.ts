import {
  AnalysisSectionType,
  ChatAnalysis,
  MessagesAbbreviatedSliceResponse
} from "@/protobuf/backend/protobuf/services";
import { AssertUnreachable, EnsureDefined } from "@/app/utils/utils";
import { CombinedChat } from "@/app/utils/entity_utils";
import { DatasetState, GrpcServices } from "@/app/utils/state";
import { AbbreviatedArray, DiffData, DiffUnits } from "@/app/diff/diff";
import { Chat, Message } from "@/protobuf/core/protobuf/entities";
import { ChatState } from "@/app/utils/chat_state";


const MAX_COMBINED_ENTRIES_SHOWN = 10;
const ABBREVIATED_ENTRIES_SHOWN = 3;

export type MessagesDiffModelRow = [Message, Chat, ChatState]
export type MessagesDiffModel = DiffData<MessagesDiffModelRow>[]

export async function MakeMessagesDiffModel(
  masterDsState: DatasetState,
  slaveDsState: DatasetState,
  analysis: ChatAnalysis,
  services: GrpcServices,
): Promise<MessagesDiffModel> {
  let masterCwd =
    EnsureDefined(masterDsState.cwds.find(cwd => cwd.chat!.id == EnsureDefined(analysis.chatIds).masterChatId))

  let slaveCwds =
    EnsureDefined(slaveDsState.cwds.find(cwd => cwd.chat!.id == EnsureDefined(analysis.chatIds).slaveChatId))

  let dsStates = [masterDsState, slaveDsState]
  let cwds = [masterCwd, slaveCwds]

  let chatStates = [
    new ChatState(new CombinedChat(masterCwd, []), masterDsState),
    new ChatState(new CombinedChat(slaveCwds, []), slaveDsState)
  ]

  let model: MessagesDiffModel = []

  // TODO: Parallelize?
  for (const section of analysis.sections) {
    const range = section.range!;
    // Note: IDs could be -1, meaning no messages are referenced in the range
    let firstAndLastIds = [
      [range.firstMasterMsgId, range.lastMasterMsgId],
      [range.firstSlaveMsgId, range.lastSlaveMsgId]
    ].map(arr => arr.map(v => v == -1n ? null : v))

    let leftRight: DiffUnits<MessagesDiffModelRow>[] = []

    function withContext(msgs: Message[], idx: number): MessagesDiffModelRow[] {
      return msgs.map(msg => [msg, cwds[idx].chat!, chatStates[idx]])
    }

    for (let i = 0; i < 2; i++) {
      let firstAndLastIdsEntry = firstAndLastIds[i]
      let msgsSlice: MessagesAbbreviatedSliceResponse = firstAndLastIdsEntry[0] !== null && firstAndLastIdsEntry[1]  !== null? (
        await services.daoClient.messagesAbbreviatedSlice({
          key: dsStates[i].fileKey,
          chat: cwds[i].chat,
          messageInternalId1: firstAndLastIdsEntry[0]!,
          messageInternalId2: firstAndLastIdsEntry[1]!,
          combinedLimit: MAX_COMBINED_ENTRIES_SHOWN,
          abbreviatedLimit: ABBREVIATED_ENTRIES_SHOWN
        })
      ) : { leftMessages: [], inBetween: 0, rightMessages: [] }

      leftRight.push(
        msgsSlice.inBetween > 0 ?
          new AbbreviatedArray(
            withContext(msgsSlice.leftMessages, i),
            msgsSlice.inBetween,
            withContext(msgsSlice.rightMessages, i)
          ) :
          withContext(msgsSlice.leftMessages, i)
      )
    }

    model.push({
      tpe: (() => {
        switch (section.tpe) {
          case AnalysisSectionType.MATCH:
            return "no-change"
          case AnalysisSectionType.CONFLICT:
            return "change"
          case AnalysisSectionType.RETENTION:
            return "keep"
          case AnalysisSectionType.ADDITION:
            return "add"
          case AnalysisSectionType.UNRECOGNIZED:
            throw new Error("Unrecognized AnalysisSectionType")
          default:
            AssertUnreachable(section.tpe)
        }
      })(),
      left: leftRight[0],
      right: leftRight[1]
    })
  }

  return model
}
