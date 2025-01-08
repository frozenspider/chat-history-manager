'use client'

import React from "react";

import Diff, { AbbreviatedArray, DiffData, DiffUnits } from "@/app/diff/diff";
import {
  CreateGrpcServicesOnce,
  DatasetState,
  GrpcServices,
  PopupReadyEventName,
  ServicesContext,
  SetPopupStateEventName
} from "@/app/utils/state";
import { ChatState, ChatStateCache, ChatStateCacheContext } from "@/app/utils/chat_state";
import {
  Assert,
  AssertUnreachable,
  EmitToSelf,
  EnsureDefined,
  Listen,
  PromiseCatchReportError
} from "@/app/utils/utils";
import { CombinedChat } from "@/app/utils/entity_utils";

import { Chat, Message } from "@/protobuf/core/protobuf/entities";

import { Loader2 } from "lucide-react";
import {
  AnalysisSectionType,
  ChatAnalysis,
  ChatWithDetailsPB,
  MessagesAbbreviatedSliceResponse,
} from "@/protobuf/backend/protobuf/services";
import { MessageComponent } from "@/app/message/message";


const MAX_COMBINED_ENTRIES_SHOWN = 10;
const ABBREVIATED_ENTRIES_SHOWN = 3;

type ModelTuple = [Message, Chat, ChatState]
type Model = DiffData<ModelTuple>[]

export default function Home() {
  // TODO: How to pass port number synchronously from Rust?
  const services = CreateGrpcServicesOnce(50051);

  const [loadInProgressText, setLoadInProgressText] =
    React.useState<string | null>("Loading...");

  const [model, setModel] =
    React.useState<Model | null>(null)

  const chatStateCache =
    React.useMemo<ChatStateCache>(() => new ChatStateCache(), [])

  React.useEffect(() => {
    // Cannot pass the payload directly because of BigInt, Map, etc. not being serializable by default
    let unlisten = Listen<string>(SetPopupStateEventName, (ev) => {
      let json = ev.payload
      let [[cwdLeftObj, cwdRightObj], [dsStateLeftObj, dsStateRightObj], analysisObj] = JSON.parse(json)
      // Parsed object is not a class (it does not have methods)
      let chatLeft = ChatWithDetailsPB.fromJSON(EnsureDefined(cwdLeftObj))
      let chatRight = ChatWithDetailsPB.fromJSON(EnsureDefined(cwdRightObj))
      let dsStateLeft = DatasetState.fromJSON(dsStateLeftObj)
      let dsStateRight = DatasetState.fromJSON(dsStateRightObj)
      let analysis = ChatAnalysis.fromJSON(EnsureDefined(analysisObj))
      PromiseCatchReportError(MakeModel(analysis, [chatLeft, chatRight], [dsStateLeft, dsStateRight], services, setLoadInProgressText, setModel))
    })

    PromiseCatchReportError(EmitToSelf(PopupReadyEventName));

    return () => PromiseCatchReportError(async () => {
      return (await unlisten)()
    })
  }, [setLoadInProgressText, setModel])

  if (loadInProgressText) {
    return <Throbber text={loadInProgressText}/>;
  }

  Assert(!!model)
  return (
    <ServicesContext.Provider value={services}> <ChatStateCacheContext.Provider value={chatStateCache}>
      <main className="mx-auto p-4">
        <Diff labels={["Left Chat", "Right Chat"]}
              diffsData={model}
              renderOne={([msg, chat, chatState]) =>
                <MessageComponent msg={msg} chat={chat} chatState={chatState} replyDepth={1}/>}/>
      </main>
    </ChatStateCacheContext.Provider> </ServicesContext.Provider>
  );
}

function Throbber(args: { text: string }) {
  // return <LoadSpinner center={true} text="Loading..."/>
  return (
    <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
      <div className="flex items-center space-x-2">
        <Loader2 className="h-6 w-6 animate-spin"/>
        <span className="text-lg font-medium">{args.text}</span>
      </div>
    </div>
  )
}

// TODO: Make this work async in the background?
async function MakeModel(
  analysis: ChatAnalysis,
  cwds: [ChatWithDetailsPB, ChatWithDetailsPB],
  dsStates: [DatasetState, DatasetState],
  services: GrpcServices,
  setLoadInProgressText: (text: string | null) => void,
  setModel: (value: Model) => void
) {
  let chatStates = [
    new ChatState(new CombinedChat(cwds[0], []), dsStates[0]),
    new ChatState(new CombinedChat(cwds[0], []), dsStates[1])
  ]

  let model: Model = []

  // TODO: Parallelize?
  for (const section of analysis.sections) {
    const range = section.range!;
    // Note: IDs could be -1, meaning no messages are referenced in the range
    let firstAndLastIds = [
      [range.firstMasterMsgId, range.lastMasterMsgId],
      [range.firstSlaveMsgId, range.lastSlaveMsgId]
    ].map(arr => arr.map(v => v == -1n ? null : v))

    let leftRight: DiffUnits<ModelTuple>[] = []

    function withContext(msgs: Message[], idx: number): ModelTuple[] {
      return msgs.map(msg => [msg, cwds[idx].chat!, chatStates[idx]])
    }

    for (let i = 0; i < 2; i++) {
      let firstAndLastIdsEntry = firstAndLastIds[i]
      let msgsSlice: MessagesAbbreviatedSliceResponse = firstAndLastIdsEntry[0] && firstAndLastIdsEntry[1] ? (
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
            case AnalysisSectionType.MATCH: return "no-change"
            case AnalysisSectionType.CONFLICT: return "change"
            case AnalysisSectionType.RETENTION: return "keep"
            case AnalysisSectionType.ADDITION: return "add"
            case AnalysisSectionType.UNRECOGNIZED: throw new Error("Unrecognized AnalysisSectionType")
            default: AssertUnreachable(section.tpe)
          }
      })(),
      left: leftRight[0],
      right: leftRight[1]
    })
  }

  setModel(model)
  setLoadInProgressText(null)
}
