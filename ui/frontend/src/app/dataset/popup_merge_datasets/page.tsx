'use client'

import React from "react";

import Diff, { DiffData } from "@/app/diff/diff";
import { CreateGrpcServicesOnce, DatasetState, GrpcServices, ServicesContext } from "@/app/utils/state";
import {
  AppEvents,
  Assert,
  AssertUnreachable,
  EmitBusy,
  EmitNotBusy,
  EmitToSelf,
  Listen,
  Noop,
  PromiseCatchReportError,
  ReportError
} from "@/app/utils/utils";

import { Loader2 } from "lucide-react";
import {
  AnalysisSectionType,
  ChatAnalysis,
  ChatMerge,
  ChatMergeType,
  MergeRequest,
  MessageMergeType,
  UserMerge,
  UserMergeType
} from "@/protobuf/backend/protobuf/services";
import ChatEntryShort from "@/app/chat/chat_entry_short";
import UserEntryTechncal from "@/app/user/user_entry_technical";
import { Button } from "@/components/ui/button";
import { CombinedChat, GetChatPrettyName } from "@/app/utils/entity_utils";
import { ChatsDiffModel, ChatsDiffModelRow, MakeChatsDiffModel } from "@/app/diff/diff_model_chats";
import { MakeUsersDiffModel, UsersDiffModel } from "@/app/diff/diff_model_users";
import { MakeMessagesDiffModel, MessagesDiffModel, MessagesDiffModelRow } from "@/app/diff/diff_model_messages";
import { MessageComponent } from "@/app/message/message";
import { DatasetsMergedEvent } from "@/app/dataset/select_datasets_to_merge_dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";


interface SelectMessagesStage {
  tpe: "select-messages"
  chatsModel: ChatsDiffModel
  chatsSelection: Set<number>
  usersModel: UsersDiffModel
  usersSelection: Set<number>
  activeUserIds: Set<bigint>
  messagesModel: MessagesDiffModel | null
  /**
   * Entries from `pendingAnalysis` that has been awaited, should be evicted from (the beginning of) `pendingAnalysis`
   */
  analysis: ChatAnalysis[]
  /**
   * Analysis entries not yet awaited, should be awaited from the beginning, resolved promises should be shifted out
   * and added to `analysis` instead.
   */
  pendingAnalysis: Promise<ChatAnalysis>[]
  /** Corresponds to `analysis` and will have the same length once all conflicts are resolved */
  resolutions: Set<number>[]
}

type Stage = {
  tpe: "loading"
} | {
  tpe: "select-chats"
  chatsModel: ChatsDiffModel
} | {
  tpe: "select-users"
  chatsModel: ChatsDiffModel
  chatsSelection: Set<number>
  usersModel: UsersDiffModel
  activeUserIds: Set<bigint>
} | {
  tpe: "analyzing"
} | SelectMessagesStage | {
  tpe: "merging"
}

// TODO: Move logic outside so that the popup can be safely closed
export default function Home() {
  // TODO: How to pass port number synchronously from Rust?
  const services = CreateGrpcServicesOnce(50051);

  const [stage, setStage] =
    React.useState<Stage>({ tpe: "loading" })

  const [masterDsState, setMasterDsState] =
    React.useState<DatasetState | null>(null)

  const [slaveDsState, setSlaveDsState] =
    React.useState<DatasetState | null>(null)

  const [newDatabaseDir, setNewDatabaseDir] =
    React.useState<string>("")

  const [chatsSelection, setChatsSelection] =
    React.useState<Set<number>>(new Set())

  const [usersSelection, setUsersSelection] =
    React.useState<Set<number>>(new Set())

  const [messagesSelection, setMessagesSelection] =
    React.useState<Set<number>>(new Set())

  // Promises will be resolved in the order
  const [analyzeChatsPromises, setAnalyzeChatsPromises] =
    React.useState<Promise<ChatAnalysis>[] | null>(null)

  const [isAnalyzing, setIsAnalyzing] =
    React.useState<boolean>(false)

  React.useEffect(() => {
    // Cannot pass the payload directly because of BigInt, Map, etc. not being serializable by default
    let unlisten = Listen<string>(AppEvents.Popup.SetState, (ev) => {
      let json = ev.payload
      let [masterDsStateObj, slaveDsStateObj, newFileName] = JSON.parse(json)
      // Parsed object is not a class (it does not have methods)
      let masterDsState = DatasetState.fromJSON(masterDsStateObj)
      let slaveDsState = DatasetState.fromJSON(slaveDsStateObj)
      setMasterDsState(masterDsState)
      setSlaveDsState(slaveDsState)
      setNewDatabaseDir(newFileName)
      PromiseCatchReportError(async () => {
        let chatsModel = await MakeChatsDiffModel(masterDsState, slaveDsState, services)
        setStage({ tpe: "select-chats", chatsModel })
      })
    })

    PromiseCatchReportError(EmitToSelf(AppEvents.Popup.Ready));

    return () => PromiseCatchReportError(async () => {
      return (await unlisten)()
    })
  }, [services, setStage, setMasterDsState, setSlaveDsState])

  const handleContinue = React.useCallback(() => {
    if (stage.tpe === "select-chats") {
      setStage({ tpe: "loading" })

      // Filter out members of deselected chats
      let activeUserIds = new Set(stage.chatsModel
        .map((data, idx) => [data, idx] as [typeof data, typeof idx])
        .filter(([data, _]) => data.tpe !== "dont-add")
        .filter(([data, idx]) => data.tpe === "keep" || data.tpe === "no-change" || chatsSelection.has(idx))
        .flatMap(([data, _]) => {
          Assert(Array.isArray(data.left) && Array.isArray(data.right))
          return [...data.left, ...data.right]
        })
        .flatMap(([cwd, _]) => cwd.chat!.memberIds))

      PromiseCatchReportError(async () => {
        let usersModel = await MakeUsersDiffModel(masterDsState!, slaveDsState!, activeUserIds, services)
        setStage({ tpe: "select-users", chatsModel: stage.chatsModel, chatsSelection, usersModel, activeUserIds })
      })

      // Start chat analysis in the background
      let chatsToAnalyze: ChatsDiffModel = stage.chatsModel
        .filter((cmo, idx) => cmo.tpe === "change" && chatsSelection.has(idx))
      setAnalyzeChatsPromises(AnalyzeChangedChats(services, chatsToAnalyze, false /* forceConflicts */))
    } else if (stage.tpe === "select-users") {
      setStage({ tpe: "analyzing" })
      setIsAnalyzing(true)
      PromiseCatchReportError(async () => {
        console.log("Number of chats analyzing in the background: " + analyzeChatsPromises?.length)
        let pendingAnalysis = analyzeChatsPromises!
        let newStage: SelectMessagesStage = {
          tpe: "select-messages",
          chatsModel: stage.chatsModel,
          chatsSelection: stage.chatsSelection,
          usersModel: stage.usersModel,
          usersSelection,
          activeUserIds: stage.activeUserIds,
          messagesModel: null,
          analysis: [],
          pendingAnalysis,
          resolutions: []
        }
        PromiseCatchReportError(AdvanceToNextStage(newStage, newDatabaseDir, setStage, setIsAnalyzing, masterDsState!, slaveDsState!, services))
      })
    } else if (stage.tpe === "select-messages") {
      setIsAnalyzing(true)
      // Make a deep (-ish) copy
      let newStage: SelectMessagesStage = {
        ...stage,
        messagesModel: null,
        analysis: [...stage.analysis],
        pendingAnalysis: [...stage.pendingAnalysis],
        resolutions: [...stage.resolutions, messagesSelection]
      }
      PromiseCatchReportError(AdvanceToNextStage(newStage, newDatabaseDir, setStage, setIsAnalyzing, masterDsState!, slaveDsState!, services))
    }
  }, [stage, masterDsState, slaveDsState, newDatabaseDir, chatsSelection, usersSelection, messagesSelection,
    services, analyzeChatsPromises])

  if (stage.tpe === "loading") {
    return <Throbber text="Loading..."/>;
  }

  if (stage.tpe === "analyzing" || isAnalyzing) {
    return <Throbber text="Analyzing differences..."/>;
  }

  if (stage.tpe === "merging") {
    return <Throbber text="Merging..."/>;
  }

  return (
    <ServicesContext.Provider value={services}>
      <main className="mx-auto p-4 flex flex-col h-screen">
        {(() => {
          if (stage.tpe === "select-chats") {
            PromiseCatchReportError(getCurrentWindow().setTitle("Select chats to merge"))
            return <Diff description={"Select chats whose messages should be merged"}
                         labels={["Master Chats", "Slave Chats"]}
                         diffsData={stage.chatsModel}
                         isToggleable={row =>
                           row.tpe === "change" || row.tpe === "add"}
                         renderOne={([cwd, dsState]) =>
                           <ChatEntryShort cc={new CombinedChat(cwd, [])} dsState={dsState} onClick={Noop}/>}
                         setToggleableSelection={setChatsSelection}/>
          } else if (stage.tpe === "select-users") {
            PromiseCatchReportError(getCurrentWindow().setTitle("Select users to merge"))
            return <Diff description={"Select users whose info should be merged.\nNote: New users will me merged regardless"}
                         labels={["Master Users", "Slave Users"]}
                         diffsData={stage.usersModel}
                         isToggleable={row => row.tpe === "change"}
                         renderOne={([user, dsState]) =>
                           <UserEntryTechncal user={user} dsState={dsState} isSelected={false}
                                              onClick={Noop}/>}
                         setToggleableSelection={setUsersSelection}/>
          } else {
            Assert(!!stage.messagesModel)
            let analysis = stage.analysis[stage.analysis.length - 1]
            let masterCwd = masterDsState!.cwds.find(cwd => cwd.chat!.id == analysis.chatIds!.masterChatId)!
            let slaveCwd = slaveDsState!.cwds.find(cwd => cwd.chat!.id == analysis.chatIds!.slaveChatId)!
            PromiseCatchReportError(getCurrentWindow().setTitle(`Select messages to merge (${GetChatPrettyName(masterCwd.chat!)})`))
            return <Diff description={"Select messages to make it to the final chat version"}
                         labels={[GetChatPrettyName(masterCwd.chat!), GetChatPrettyName(slaveCwd.chat!)]}
                         diffsData={stage.messagesModel}
                         isToggleable={IsMessageToggleable}
                         renderOne={([msg, chat, chatState]) =>
                           <MessageComponent msg={msg} chat={chat} chatState={chatState} replyDepth={1}/>}
                         setToggleableSelection={setMessagesSelection}/>
          }
        })()}
        <Button variant="default"
                className="mt-4"
                onClick={handleContinue}>
          Continue
        </Button>
      </main>
    </ServicesContext.Provider>
  )
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

function IsMessageToggleable(row: DiffData<MessagesDiffModelRow>) {
  return row.tpe === "change" || row.tpe === "add"
}

function ChatHasToggleableChanges(analysis: ChatAnalysis) {
  return analysis.sections.some(section =>
    section.tpe === AnalysisSectionType.ADDITION || section.tpe === AnalysisSectionType.CONFLICT)
}

/** Start chats analysis process in the background, returning a list of promises that should be waited in order */
function AnalyzeChangedChats(
  service: GrpcServices,
  chatsToAnalyze: ChatsDiffModel,
  forceConflicts: boolean
): Promise<ChatAnalysis>[] {
  let resolves: ((res: ChatAnalysis) => void)[] = []
  let rejects: ((err: any) => void)[] = []
  let result: Promise<ChatAnalysis>[] = []
  for (let i = 0; i < chatsToAnalyze.length; i++) {
    result.push(new Promise((resolve, reject) => {
      resolves.push(resolve)
      rejects.push(reject)
    }));
  }

  console.log("Number of changed chats to analyze: " + chatsToAnalyze.length)

  let asyncInner = async () => {
    await EmitBusy("Analyzing...")

    for (let i = 0; i < chatsToAnalyze.length; i++) {
      let cmo = chatsToAnalyze[i]
      Assert(cmo.tpe === "change")
      Assert(Array.isArray(cmo.left) && Array.isArray(cmo.right))
      let [masterCwd, masterDsState] = cmo.left[0]
      let [slaveCwd, slaveDsState] = cmo.right[0]
      let masterChat = masterCwd.chat!
      let slaveChat = slaveCwd.chat!
      Assert(masterChat.id === slaveChat.id)

      await EmitBusy(`Analyzing ${GetChatPrettyName(masterChat)}...`)
      let analysis = (await service.mergeClient.analyze({
        masterDaoKey: masterDsState.fileKey,
        masterDsUuid: masterDsState.ds.uuid,
        slaveDaoKey: slaveDsState.fileKey,
        slaveDsUuid: slaveDsState.ds.uuid,
        forceConflicts: forceConflicts,
        chatIdPairs: [{ masterChatId: masterChat.id, slaveChatId: slaveChat.id }]
      })).analysis[0]
      let diffs = analysis.sections

      // Sanity check
      if (diffs.length >= 500) {
        rejects[i](new AnalyzeChatError(`Too many differences`, masterChat.id))
      } else {
        resolves[i](analysis)
      }
    }
  }
  PromiseCatchReportError(asyncInner()
    .catch(err => {
      rejects.forEach(reject => reject(err))
      throw err
    })
    .finally(() => EmitNotBusy()))
  return result
}

async function AdvanceToNextStage(
  mutableStage: SelectMessagesStage,
  newDatabaseDir: string,
  setStage: (stage: Stage) => void,
  setIsAnalyzing: (analyzing: boolean) => void,
  masterDsState: DatasetState,
  slaveDsState: DatasetState,
  services: GrpcServices,
): Promise<void> {
  while (true) {
    if (mutableStage.pendingAnalysis.length > 0) {
      console.log("Waiting for the next analysis...")
      let chatAnalysis = await mutableStage.pendingAnalysis.shift()!.catch(err => {
        Assert(err instanceof AnalyzeChatError)
        return err
      })
      console.log("Analysis ready", chatAnalysis)
      if (chatAnalysis instanceof AnalyzeChatError) {
        // Skip this chat
        let chatId = chatAnalysis.chatId
        let chatIdxInModel = mutableStage.chatsModel.findIndex(d => {
          let left = d.left as Array<ChatsDiffModelRow>
          return left.length > 0 && left[0][0].chat!.id === chatId
        })
        let chat = (mutableStage.chatsModel[chatIdxInModel].left as Array<ChatsDiffModelRow>)[0][0].chat!
        // TODO: If this is the last chat, dialog will close before we can read this alert
        ReportError("Chat '" + GetChatPrettyName(chat) + "' will be skipped: " + chatAnalysis.message)
        Assert(chatIdxInModel != -1)
        mutableStage.chatsSelection.delete(chatIdxInModel)
        // Continue the loop
      } else {
        mutableStage.analysis.push(chatAnalysis)
        if (ChatHasToggleableChanges(chatAnalysis)) {
          mutableStage.messagesModel = await MakeMessagesDiffModel(masterDsState, slaveDsState, chatAnalysis, services)
          setStage(mutableStage)
          setIsAnalyzing(false)
          return
        } else {
          // User has nothing to choose from, just resolve the conflict automatically
          mutableStage.resolutions.push(new Set())
          // Continue the loop
        }
      }
    } else {
      console.log("All conflicts have been resolved")
      // All conflicts have been resolved
      setStage({ tpe: "merging" })
      setIsAnalyzing(false)
      MergeChats(masterDsState, slaveDsState, newDatabaseDir, mutableStage)
      return
    }
  }
}

function MergeChats(
  masterDsState: DatasetState,
  slaveDsState: DatasetState,
  newDatabaseDir: string,
  stage: SelectMessagesStage,
) {
  Assert(stage.messagesModel === null, "Messages diff model should not be set at this point")
  Assert(stage.analysis.length === stage.resolutions.length, "Mismatching number of analysis and resolutions")
  Assert(stage.pendingAnalysis.length === 0, "Merge started with analysis pending")

  let userMerges: UserMerge[] =
    stage.usersModel.map((diff, diffIdx) => {
      Assert(Array.isArray(diff.left) && Array.isArray(diff.right));
      let userId = diff.right.length > 0 ? diff.right[0][0].id : diff.left[0][0].id
      let tpe: UserMergeType = (() => {
        switch (diff.tpe) {
          case "no-change":
            return UserMergeType.MATCH_OR_DONT_REPLACE
          case "change":
            return stage.usersSelection.has(diffIdx) ?
              UserMergeType.REPLACE :
              UserMergeType.MATCH_OR_DONT_REPLACE
          case "add":
            // Users are added depending solely on whether they are present in active chats.
            return stage.activeUserIds.has(userId) ?
              UserMergeType.ADD :
              UserMergeType.DONT_ADD
          case "dont-add":
            return UserMergeType.DONT_ADD
          case "keep":
            return UserMergeType.RETAIN
          default:
            AssertUnreachable(diff.tpe)
        }
      })()
      return { tpe, userId }
    })

  let chatMerges: ChatMerge[] =
    stage.chatsModel.map((diff, diffIdx) => {
      Assert(Array.isArray(diff.left));
      Assert(Array.isArray(diff.right));
      let tpe: ChatMergeType = (() => {
        switch (diff.tpe) {
          case "no-change":
            return ChatMergeType.DONT_MERGE
          case "change":
            return stage.chatsSelection.has(diffIdx) ? ChatMergeType.MERGE : ChatMergeType.DONT_MERGE
          case "add":
            return stage.chatsSelection.has(diffIdx) ? ChatMergeType.ADD : ChatMergeType.DONT_ADD
          case "dont-add":
            return ChatMergeType.DONT_ADD
          case "keep":
            return ChatMergeType.RETAIN
          default:
            AssertUnreachable(diff.tpe)
        }
      })()

      let chatMerge: ChatMerge = {
        tpe,
        chatId: diff.right.length > 0 ? diff.right[0][0].chat!.id : diff.left[0][0].chat!.id,
        messageMerges: []
      }

      if (diff.tpe === "change" && stage.chatsSelection.has(diffIdx)) {
        // TODO: We could use maps, but meh
        let idx = stage.analysis.findIndex(analysis => analysis.chatIds!.masterChatId === chatMerge.chatId)
        Assert(idx >= 0, "Analysis not found for chat " + chatMerge.chatId)
        let [analysis, resolution] = [stage.analysis[idx], stage.resolutions[idx]]
        chatMerge.messageMerges =
          analysis.sections.map((section, idx) => {
            let tpe: MessageMergeType = (() => {
              switch (section.tpe) {
                case AnalysisSectionType.MATCH:
                  return MessageMergeType.MATCH
                case AnalysisSectionType.RETENTION:
                  return MessageMergeType.RETAIN
                case AnalysisSectionType.ADDITION:
                  return resolution.has(idx) ? MessageMergeType.ADD : MessageMergeType.DONT_ADD
                case AnalysisSectionType.CONFLICT:
                  return resolution.has(idx) ? MessageMergeType.REPLACE : MessageMergeType.DONT_REPLACE
                case AnalysisSectionType.UNRECOGNIZED:
                  throw new Error("Unrecognized section type")
                default:
                  AssertUnreachable(section.tpe)
              }
            })()
            return { tpe, range: section.range }
          })
      }

      return chatMerge
    })

  let mergeRequest: MergeRequest = {
    masterDaoKey: masterDsState.fileKey,
    masterDsUuid: masterDsState.ds.uuid,
    slaveDaoKey: slaveDsState.fileKey,
    slaveDsUuid: slaveDsState.ds.uuid,
    newDatabaseDir,
    userMerges,
    chatMerges
  }

  PromiseCatchReportError(async () => {
    await EmitToSelf(DatasetsMergedEvent, MergeRequest.toJSON(mergeRequest))
    await getCurrentWindow().close()
  })
}

class AnalyzeChatError extends Error {
    chatId: bigint

    constructor(message: string, chatId: bigint) {
        super(message)
        this.name = "AnalyzeChatError"
        this.chatId = chatId
        // Set the prototype explicitly to maintain the correct prototype chain
        Object.setPrototypeOf(this, AnalyzeChatError.prototype)
    }
}
