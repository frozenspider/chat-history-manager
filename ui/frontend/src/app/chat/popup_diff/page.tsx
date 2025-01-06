'use client'

import React from "react";
import { emit } from "@tauri-apps/api/event";

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
import { Assert, AssertUnreachable, EnsureDefined, Listen, PromiseCatchReportError } from "@/app/utils/utils";
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
    PromiseCatchReportError(Listen<string>(SetPopupStateEventName, (ev) => {
      let json = ev.payload
      let [[cwdLeftObj, cwdRightObj], [dsStateLeftObj, dsStateRightObj], analysisObj] = JSON.parse(json)
      // Parsed object is not a class (it does not have methods)
      let chatLeft = ChatWithDetailsPB.fromJSON(EnsureDefined(cwdLeftObj))
      let chatRight = ChatWithDetailsPB.fromJSON(EnsureDefined(cwdRightObj))
      let dsStateLeft = DatasetState.fromJSON(dsStateLeftObj)
      let dsStateRight = DatasetState.fromJSON(dsStateRightObj)
      let analysis = ChatAnalysis.fromJSON(EnsureDefined(analysisObj))
      PromiseCatchReportError(MakeModel(analysis, [chatLeft, chatRight], [dsStateLeft, dsStateRight], services, setLoadInProgressText, setModel))
    }))

    PromiseCatchReportError(emit(PopupReadyEventName));
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
  await new Promise(r => setTimeout(r, 5000));

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

export type SampleMessage = {
  id: string;
  content: string;
  timestamp: number;
  author: string;
};

function RenderOne(message: SampleMessage): React.JSX.Element {
  return <>
    <div className="flex-grow overflow-hidden">
      <div className={`rounded-lg p-3 break-words h-full`}>
        <p className="text-sm">{message.content}</p>
      </div>
      <span className="text-xs text-gray-500 mt-1 block">
        {new Date(message.timestamp).toLocaleString()}
      </span>
    </div>
  </>
}

const data: Array<DiffData<SampleMessage>> = [
  {
    tpe: 'no-change',
    left: [
      { id: '1', content: 'Hello', timestamp: 1625097600000, author: 'Alice' },
      { id: '2', content: 'How are you?', timestamp: 1625097660000, author: 'Alice' },
      { id: '3', content: 'I\'m good, thanks!', timestamp: 1625097720000, author: 'Bob' },
      { id: '4', content: 'What are your plans for today?', timestamp: 1625097780000, author: 'Alice' },
    ],
    right: [
      { id: '1', content: 'Hello', timestamp: 1625097600000, author: 'Alice' },
      { id: '2', content: 'How are you doing?', timestamp: 1625097660000, author: 'Alice' },
      { id: '3', content: 'I\'m fine, thank you!', timestamp: 1625097720000, author: 'Bob' },
      { id: '4', content: 'What are your plans for today?', timestamp: 1625097780000, author: 'Alice' },
    ]
  },
  {
    tpe: "change",
    left: [
      { id: '5', content: 'I\'m going to the park', timestamp: 1625097840000, author: 'Bob' },
      { id: '6', content: 'That sounds nice', timestamp: 1625097900000, author: 'Alice' },
      { id: '7', content: 'Would you like to join me?', timestamp: 1625097960000, author: 'Bob' },
      { id: '8', content: 'Sure, I\'d love to!', timestamp: 1625098020000, author: 'Alice' },
      { id: '9', content: 'Great, let\'s meet at 2 PM', timestamp: 1625098080000, author: 'Bob' },
      { id: '10', content: 'Sounds good, see you then!', timestamp: 1625098140000, author: 'Alice' },
    ],
    right: [
      {
        id: '5',
        content: "I'm thinking of going to the movies. There's this new sci-fi film that just came out, and I've heard great reviews about it. It's supposed to have amazing special effects and a really engaging plot. The director is known for creating thought-provoking stories that keep you on the edge of your seat. I was wondering if you'd be interested in joining me? We could make an evening of it - perhaps grab dinner before the show and discuss the film afterwards. What do you think? It could be a fun way to spend our evening and catch up.",
        timestamp: 1625097840000,
        author: 'Bob'
      },
      { id: '6', content: 'That sounds interesting', timestamp: 1625097900000, author: 'Alice' },
      { id: '7', content: 'Would you like to come along?', timestamp: 1625097960000, author: 'Bob' },
      { id: '8', content: 'I\'d love to, but I have other plans', timestamp: 1625098020000, author: 'Alice' },
      { id: '9', content: 'No problem, maybe next time', timestamp: 1625098080000, author: 'Bob' },
      { id: '10', content: 'Definitely, enjoy your movie!', timestamp: 1625098140000, author: 'Alice' },
    ]
  },
  {
    tpe: 'no-change',
    left: new AbbreviatedArray(
      [
        { id: '11', content: 'Don\'t forget to bring water', timestamp: 1625098200000, author: 'Bob' },
        { id: '12', content: 'Thanks for the reminder', timestamp: 1625098260000, author: 'Alice' },
      ],
      100500,
      [
        { id: '13', content: 'I\'ll bring some snacks too', timestamp: 1625098320000, author: 'Alice' },
        { id: '14', content: 'Great idea!', timestamp: 1625098380000, author: 'Bob' },
      ],
    ),
    right: new AbbreviatedArray(
      [
        { id: '11', content: 'Thanks, have a great day!', timestamp: 1625098200000, author: 'Bob' },
        { id: '12', content: 'You too!', timestamp: 1625098260000, author: 'Alice' },
      ],
      100500,
      [
        { id: '13', content: 'By the way, did you finish the project?', timestamp: 1625098320000, author: 'Bob' },
        { id: '14', content: 'Yes, I submitted it yesterday', timestamp: 1625098380000, author: 'Alice' },
      ],
    )
  },
  {
    tpe: "keep",
    left: [
      { id: '15', content: 'This message will be removed', timestamp: 1625098440000, author: 'Alice' },
      { id: '16', content: 'This one too', timestamp: 1625098500000, author: 'Bob' },
      { id: '17', content: 'And this is the last removed message', timestamp: 1625098560000, author: 'Alice' },
    ],
    right: []
  },
  {
    tpe: "add",
    left: [],
    right: [
      { id: '15', content: 'Great job!', timestamp: 1625098440000, author: 'Bob' },
      { id: '16', content: 'Thanks! It was challenging', timestamp: 1625098500000, author: 'Alice' },
      { id: '17', content: 'I\'m sure you did well', timestamp: 1625098560000, author: 'Bob' },
    ]
  },
  {
    tpe: "keep",
    left: new AbbreviatedArray(
      [
        { id: '21', content: 'This is a removed message', timestamp: 1625098800000, author: 'Alice' },
        { id: '22', content: 'Another removed message', timestamp: 1625098860000, author: 'Bob' },
      ],
      100500,
      [
        { id: '23', content: 'One more removed message', timestamp: 1625098920000, author: 'Alice' },
        { id: '24', content: 'Last removed message', timestamp: 1625098980000, author: 'Bob' },
      ],
    ),
    right: []
  },
  {
    tpe: "add",
    left: [],
    right: new AbbreviatedArray(
      [
        { id: '18', content: 'This is a new message', timestamp: 1625098620000, author: 'Alice' },
        { id: '19', content: 'Another new message', timestamp: 1625098680000, author: 'Bob' },
      ],
      100500,
      [
        { id: '20', content: 'And one more new message', timestamp: 1625098740000, author: 'Alice' },
        { id: '21', content: 'And one more new message!', timestamp: 1625098740001, author: 'Bob' },
      ]
    ),
  },
];
