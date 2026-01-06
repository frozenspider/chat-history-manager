'use client'

import React from "react";
import { emitTo } from "@tauri-apps/api/event";
import { message, save } from "@tauri-apps/plugin-dialog";

import {
  AppEvent,
  AppEvents,
  Assert,
  EmitBusy,
  EmitNotBusy,
  EnsureDefined,
  GetLastPathElement,
  InvokeTauri,
  InvokeTauriAsync,
  Listen,
  PromiseCatchReportError,
  SerializeJson,
  SpawnPopup
} from "@/app/utils/utils";
import {
  CreateGrpcServicesOnce,
  DatasetState,
  LoadedFileState,
  NavigationCallbacks,
  ServicesContext,
  GetServices,
  GrpcServices,
} from "@/app/utils/state";
import { UserUpdatedEvent } from "@/app/user/manage_users";
import { ChatState, ChatStateCache, ChatStateCacheContext } from "@/app/utils/chat_state";
import { CombinedChat } from "@/app/utils/entity_utils";
import { TestChatState, TestLoadedFiles } from "@/app/utils/test_entities";
import { cn } from "@/lib/utils";

import { PbUuid, User } from "@/protobuf/core/protobuf/entities";
import {
  ChatWithDetailsPB,
  EnsureSameRequest,
  EnsureSameResponse,
  MergeRequest
} from "@/protobuf/backend/protobuf/services";
import camelcaseKeysDeep from "camelcase-keys-deep";

import NavigationBar from "@/app/navigation_bar";
import SelectDatasetsToMergeDialog, { DatasetsMergedEvent } from "@/app/dataset/select_datasets_to_merge_dialog";
import SaveAs, { SaveAsState } from "@/app/dataset/save_as";
import ShiftDatasetTime, { ShiftDatasetTimeState } from "@/app/dataset/shift_dataset_time";
import ChatList from "@/app/chat/chat_list";
import MessagesList from "@/app/message/message_list";
import SelectDatasetsToCompareDialog from "@/app/dataset/select_datasets_to_compare_dialog";
import LoadSpinner from "@/app/general/load_spinner";
import UserInputRequsterComponent, { UserInputRequestState } from "@/app/general/user_input_requester";
import { InputOverlay } from "@/app/general/input_overlay";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { ExportChatHtml } from "@/app/general/export_as_html";


const USE_TEST_DATA = false;

let firstLoadCalled = USE_TEST_DATA;

export default function Home() {
  // In test mode, use test data instead of fetching
  let [loaded, setLoaded] =
    React.useState<boolean>(USE_TEST_DATA)
  let [openFiles, setOpenFiles] =
    React.useState<LoadedFileState[]>(USE_TEST_DATA ? TestLoadedFiles : [])
  let [currentFileState, setCurrentFileState] =
    React.useState<LoadedFileState | null>(openFiles[0] ?? null)
  let [currentChatState, setCurrentChatState] =
    React.useState<ChatState | null>(() => USE_TEST_DATA ? TestChatState : null)
  let [navigationCallbacks, setNavigationCallbacks] =
    React.useState<NavigationCallbacks | null>(null)
  let [filterTerm, setFilterTerm] =
    React.useState("")


  let [renameDatasetState, setRenameDatasetState] = React.useState<RenameDatasetState | null>(null)
  let [compareDatasetsOpenState, setCompareDatasetsOpenState] = React.useState<boolean>(false)
  let [mergeDatasetsState, setMergeDatasetsState] = React.useState<MergeDatasetsState>({ tpe: "closed" })
  let [shiftDatasetTimeState, setShiftDatasetTimeState] = React.useState<ShiftDatasetTimeState | null>(null)
  let [saveAsState, setSaveAsState] = React.useState<SaveAsState | null>(null)
  let [manageUsersState, setManageUsersState] = React.useState<boolean>(false)
  let [userInputRequestState, setUserInputRequestState] = React.useState<UserInputRequestState | null>(null)
  let [busyState, setBusyState] = React.useState<string | null>(null)
  let [alertDialogState, setAlertDialogState] = React.useState<AlertDialogState | null>(null)

  // TODO: How to pass port number synchronously from Rust?
  const services = CreateGrpcServicesOnce(50051);

  const chatStateCache = React.useMemo<ChatStateCache>(() => new ChatStateCache(), [])

  const reloadDatasetChats = async (fileKey: string, dsUuid: PbUuid) => {
    let chatsResponse = await services.daoClient.chats({ key: fileKey, dsUuid })

    let [_newDsState, newOpenFile, newOpenFiles] =
      ChangeDatasetCwds(openFiles, fileKey, dsUuid, _oldCwds => chatsResponse.cwds)

    setCurrentChatState(null)
    setCurrentFileState(f => f?.key == newOpenFile.key ? newOpenFile : f)
    setOpenFiles(newOpenFiles)
  }

  let loadExisting = React.useCallback(async () =>
      LoadExistingData(services, chatStateCache, setOpenFiles, setCurrentFileState, setCurrentChatState),
    [services, chatStateCache])

  // This cannot be called during prerender as it relies on window object
  React.useEffect(() => {
    // Even names here are hardcoded on the backend
    let unlistenPromises = [
      Listen<string | null>(AppEvents.Busy, (ev) => {
        setBusyState(ev.payload)
      }),
      Listen(BackendEvents.OpenFilesChanges, () => {
        setLoaded(false)
        PromiseCatchReportError(loadExisting()
          .then(() => setLoaded(true)))
      }),
      Listen<[string, string, string]>(BackendEvents.SaveAsClicked, (ev) => {
        let [key, oldFileName, oldStoragePath] = ev.payload
        setSaveAsState({ key, oldFileName, oldStoragePath })
      }),
      Listen<void>(BackendEvents.UsersClicked, (_ev) => {
        setManageUsersState(true)
      }),
      Listen<void>(BackendEvents.CompareDatasetsClicked, (_ev) => {
        setCompareDatasetsOpenState(true)
      }),
      Listen<void>(BackendEvents.MergeDatasetsClicked, (_ev) => {
        setMergeDatasetsState({ tpe: "select-datasets" })
      }),
      Listen<Array<object>>(BackendEvents.ChooseMyself, (ev) => {
        let snakeCaseUsers = ev.payload
        let users = snakeCaseUsers.map(camelcaseKeysDeep).map(User.fromJSON)
        setUserInputRequestState({ $case: "choose_myself", users })
      }),
      Listen<string>(BackendEvents.AskForText, (ev) => {
        let prompt = ev.payload
        setUserInputRequestState({ $case: "ask_for_text", prompt })
      }),
      Listen<Uint8Array>(BackendEvents.CompareDatasetsFinished, (ev) => {
        let payload = ev.payload
        let response = EnsureSameResponse.decode(payload)
        CompareDatasetsFinish(response, setAlertDialogState)
      })
    ]

    if (!firstLoadCalled) {
      PromiseCatchReportError(loadExisting()
        .then(() => setLoaded(true)))

      firstLoadCalled = true
    }

    return () => PromiseCatchReportError(async () => {
      await Promise.all(unlistenPromises.map(p => p.then(f => f())))
    })
  }, [services])

  if (manageUsersState) {
    ShowManageUsersPopup(services, openFiles, () => {
      PromiseCatchReportError(async () => {
        // Do not bother with fine-grained reload here, just reload everything
        setCurrentChatState(null)
        setCurrentFileState(null)
        setOpenFiles([])
        await loadExisting()
      })
    })
    setManageUsersState(false)
  }

  let tabs = React.useMemo(() => {
    if (openFiles.length <= 1)
      return <></>
    return (
      <Tabs defaultValue={currentFileState?.key}
            onValueChange={(newKey) => {
              let file = openFiles.find(f => f.key == newKey)
              if (file) {
                setCurrentFileState(file)
              }
            }}
            className="w-[400px]">
        <TabsList>{
          openFiles.map((file) =>
            <TabsTrigger key={file.key} value={file.key}>{file.name}</TabsTrigger>
          )
        }</TabsList>
      </Tabs>
    )
  }, [openFiles, currentFileState])

  return (
    <ServicesContext.Provider value={services}> <ChatStateCacheContext.Provider value={chatStateCache}>
      <div className="mx-auto p-6 md:p-10 flex flex-col h-screen">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={33} minSize={10}>
            <div className="border-r h-full relative flex flex-col">
              <div className="m-1">
                <Input type="text"
                       placeholder="Filter chats..."
                       value={filterTerm}
                       onChange={(e) => setFilterTerm(e.target.value)}/>
              </div>

              <ScrollArea className="w-full rounded-md border">
                {tabs}
                <ScrollBar orientation="horizontal"/>
              </ScrollArea>

              <ScrollArea className="h-full w-full rounded-md border">
                {loaded ?
                  <ChatList fileState={currentFileState}
                            setChatState={setCurrentChatState}
                            filterTerm={filterTerm}
                            callbacks={{
                              onRenameDatasetClick: (dsState) => {
                                setRenameDatasetState({
                                  key: dsState.fileKey,
                                  dsUuid: dsState.ds.uuid!,
                                  oldName: dsState.ds.alias
                                })
                              },
                              onShiftDatasetTimeClick: (dsState) => {
                                setShiftDatasetTimeState({
                                  key: dsState.fileKey,
                                  dsUuid: dsState.ds.uuid!,
                                })
                              },
                              onDeleteDataset: (dsState) => {
                                DeleteDataset(dsState, services, chatStateCache, openFiles,
                                  setOpenFiles, setCurrentFileState, setCurrentChatState)
                              },
                              onSetSecondary: (cc, dsState, newMainId) => {
                                SetSecondaryChat(cc, dsState, newMainId, services, chatStateCache, reloadDatasetChats)
                              },
                              onCompareWith: (cwd, otherChatId, dsState) => {
                                ShowCompareChatsPopup(cwd, otherChatId, dsState, services)
                              },
                              onExportAsHtml: (cc, dsState) => {
                                ExportChatAsHtml(cc, dsState, services)
                              },
                              onDeleteChat: (cc, dsState) => {
                                DeleteChat(cc, dsState, services, chatStateCache, openFiles,
                                  setOpenFiles, setCurrentFileState, setCurrentChatState)
                              },
                            }}/> :
                  <LoadSpinner center={true} text="Loading..."/>}

              </ScrollArea>

              <div>{busyState ? <LoadSpinner center={true} text={busyState}/> : <></>}</div>
            </div>
          </ResizablePanel>
          <ResizableHandle className="w-2 bg-background"/>
          <ResizablePanel defaultSize={67}>
            <div className="h-full flex flex-col">
              <NavigationBar chatState={currentChatState}
                             navigationCallbacks={navigationCallbacks}/>

              <ScrollAreaPrimitive.Root className={cn(
                "relative overflow-hidden",
                "h-full w-full rounded-md border"
              )}>
                <MessagesList chatState={currentChatState}
                              setChatState={setCurrentChatState}
                              setNavigationCallbacks={setNavigationCallbacks}
                              preloadEverything={false}/>
                <ScrollBar/>
                <ScrollAreaPrimitive.Corner/>
              </ScrollAreaPrimitive.Root>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <AlertDialogPopup state={alertDialogState} setState={setAlertDialogState}/>

      <RenameDatasetComponent renameDatasetState={renameDatasetState}
                              setRenameDatasetState={setRenameDatasetState}
                              openFiles={openFiles}
                              setOpenFiles={setOpenFiles}
                              currentFileState={currentFileState}
                              setCurrentFileState={setCurrentFileState}/>
      <ShiftDatasetTime shiftDatasetTimeState={shiftDatasetTimeState}
                        setShiftDatasetTimeState={setShiftDatasetTimeState}
                        clearCurrentChatState={() => setCurrentChatState(null)}
                        reload={loadExisting}/>
      <SaveAs title="Save dataset as"
              saveAsState={saveAsState}
              onNamePicked={(name, _fullPath, oldState) => SaveDatasetAs(name, oldState, loadExisting)}
              dispose={() => setSaveAsState(null)}/>
      <SelectDatasetsToCompareDialog openFiles={openFiles}
                                     isOpen={compareDatasetsOpenState}
                                     onConfirm={(left, right) => {
                                       CompareDatasetsStart(left, right)
                                       setCompareDatasetsOpenState(false)
                                     }}
                                     onClose={() => setCompareDatasetsOpenState(false)}/>
      <SelectDatasetsToMergeDialog openFiles={openFiles}
                                   isOpen={mergeDatasetsState.tpe == "select-datasets"}
                                   onConfirm={(masterDsState, slaveDsState) =>
                                     setMergeDatasetsState({ tpe: "pick-name", masterDsState, slaveDsState })}
                                   onClose={() =>
                                     setMergeDatasetsState(s => s.tpe == "select-datasets" ? { tpe: "closed" } : s)}/>
      <SaveAs title="Pick new database name"
              saveAsState={(() => {
                if (mergeDatasetsState.tpe == "pick-name") {
                  let masterFile = EnsureDefined(openFiles.find(f => f.key == mergeDatasetsState.masterDsState.fileKey))
                  return {
                    key: mergeDatasetsState.masterDsState.fileKey,
                    oldFileName: GetLastPathElement(masterFile.storagePath),
                    oldStoragePath: masterFile.storagePath
                  }
                } else {
                  return null
                }
              })()}
              onNamePicked={async (_name, fullPath, _oldState) => {
                Assert(mergeDatasetsState.tpe == "pick-name")
                setMergeDatasetsState({ tpe: "closed" })
                MergeDatasets(mergeDatasetsState.masterDsState, mergeDatasetsState.slaveDsState, fullPath)
              }}
              dispose={() => setMergeDatasetsState({ tpe: "closed" })}/>
      <UserInputRequsterComponent state={userInputRequestState} setState={setUserInputRequestState}/>
    </ChatStateCacheContext.Provider> </ServicesContext.Provider>
  )
}

interface AlertDialogState {
  title: string,
  content: React.JSX.Element,
}
interface RenameDatasetState {
  key: string,
  dsUuid: PbUuid,
  oldName: string
}
type MergeDatasetsState = {
  tpe: "closed"
} | {
  tpe: "select-datasets"
} | {
  masterDsState: DatasetState,
  slaveDsState: DatasetState,
  tpe: "pick-name"
}

const BackendEvents = {
  OpenFilesChanges: "open-files-changed" as AppEvent,
  SaveAsClicked: "save-as-clicked" as AppEvent,
  UsersClicked: "users-clicked" as AppEvent,
  CompareDatasetsClicked: "compare-datasets-clicked" as AppEvent,
  CompareDatasetsFinished: "compare-datasets-finished" as AppEvent,
  MergeDatasetsClicked: "merge-datasets-clicked" as AppEvent,
  ChooseMyself: "choose-myself" as AppEvent,
  AskForText: "ask-for-text" as AppEvent,
}

async function LoadExistingData(
  services: GrpcServices,
  chatStateCache: ChatStateCache,
  setOpenFiles: (change: (v: LoadedFileState[]) => LoadedFileState[]) => void,
  setCurrentFileState: (change: (v: LoadedFileState | null) => (LoadedFileState | null)) => void,
  setCurrentChatState: (change: (v: ChatState | null) => (ChatState | null)) => void
) {
  let loadedFilesResponse = await services.loadClient.getLoadedFiles({});
  let newOpenFiles: Array<LoadedFileState> = []
  for (let file of loadedFilesResponse.files) {
    let fileState: LoadedFileState = {
      key: file.key,
      name: file.name,
      storagePath: file.storagePath,
      datasets: [],
    }

    let datasetsResponse = await services.daoClient.datasets({ key: file.key })
    for (let ds of datasetsResponse.datasets) {
      let dsRootResponse =
        await services.daoClient.datasetRoot({ key: file.key, dsUuid: ds.uuid })
      let datasetState: DatasetState = {
        fileKey: file.key,
        ds: ds,
        dsRoot: dsRootResponse.path,
        users: new Map<bigint, User>,
        myselfId: BigInt(-1),
        cwds: []
      }

      let usersResponse = await services.daoClient.users({ key: file.key, dsUuid: ds.uuid })
      Assert(usersResponse.users.length > 0, "Dataset " + ds.uuid?.value + "contains no users!")
      datasetState.myselfId = usersResponse.users[0].id

      // Construct a map of users by id
      usersResponse.users.forEach((user) => {
        datasetState.users.set(user.id, user)
      })

      let chatsResponse = await services.daoClient.chats({ key: file.key, dsUuid: ds.uuid })
      datasetState.cwds = chatsResponse.cwds

      fileState.datasets.push(datasetState)
    }
    newOpenFiles.push(fileState)
  }

  // We have to use this chain to avoid passing stale values captured by the closure
  setOpenFiles(openFiles => {
    setCurrentFileState(currentFileState => {
      // Close files no longer in scope
      openFiles
        .filter(f => !newOpenFiles.some(f2 => f2.key == f.key))
        .forEach(closed => {
          chatStateCache.Clear(closed.key)
          if (currentFileState?.key == closed.key)
            currentFileState = null
          setCurrentChatState(chatState =>
            chatState?.dsState?.fileKey == closed.key ? null : chatState)
        })

      // Reset open files
      if (currentFileState == null && newOpenFiles.length > 0) {
        currentFileState = newOpenFiles[0]
      }
      return currentFileState
    })
    return newOpenFiles
  })
}

async function SaveDatasetAs(
  newName: string,
  oldState: SaveAsState,
  reload: () => Promise<void>
) {
  // Busy state is managed by Rust here.
  // TODO: Is that what we want?
  await InvokeTauriAsync<void>("save_as", {
    key: oldState.key,
    newName: newName
  })

  await reload()
}

function ShowManageUsersPopup(
  services: GrpcServices,
  openFiles: LoadedFileState[],
  reload: () => void,
) {
  const serializeState = (openFiles: LoadedFileState[]) => {
    // Cannot pass the payload directly because of BigInt not being serializable by default
    return SerializeJson(openFiles)
  }

  let label = "manage-users-window";
  SpawnPopup<string>(label, "Users", "/user/popup_manage_users", 600, screen.availHeight - 100, {
    setState: () => serializeState(openFiles),
    listeners: [
      // User updated
      // ============
      // New user should have the same ID as before
      [UserUpdatedEvent, async (ev) => {
        PromiseCatchReportError(async () => {
          let [newUserObj, dsStateObj] = JSON.parse(ev.payload)
          let newUser = User.fromJSON(newUserObj)

          // Normalize phone number by removing all non-digit non-plus characters and replacing leading 00 with +
          if (newUser.phoneNumberOption !== undefined) {
            newUser.phoneNumberOption = newUser.phoneNumberOption
              .replace(/^00/, "+")
              .replace(/[^+\d]/g, "")
          }

          let oldDsState = DatasetState.fromJSON(dsStateObj)

          let [_newDsState, _newOpenFile, newOpenFiles] =
            ChangeDataset(openFiles, oldDsState.fileKey, oldDsState!.ds!.uuid!, dsState => {
              let newUsers = new Map(dsState.users)
              newUsers.set(newUser.id, newUser)
              return { ...dsState, users: newUsers }
            })

          await services.daoClient.backup({ key: oldDsState.fileKey })
          await services.daoClient.updateUser({
            key: oldDsState.fileKey,
            user: newUser
          })

          await emitTo(label, AppEvents.Popup.SetState, serializeState(newOpenFiles))
          reload()
        })
      }]
    ]
  })
}

function ChangeDataset(
  openFiles: LoadedFileState[],
  fileKey: string,
  dsUuid: PbUuid,
  change: (dsState: DatasetState) => DatasetState
): [DatasetState, LoadedFileState, LoadedFileState[]] {
  let oldOpenFile = EnsureDefined(openFiles.find(f => f.key == fileKey), "File not found")

  let oldDsStateIdx = oldOpenFile.datasets.findIndex(ds => ds.ds.uuid!.value == dsUuid.value)
  Assert(oldDsStateIdx >= 0, "Dataset not found")

  let oldDsState = oldOpenFile.datasets[oldDsStateIdx]

  let newDsState: DatasetState = change(oldDsState)

  let newOpenFile: LoadedFileState = {
    ...oldOpenFile,
    datasets: [...oldOpenFile.datasets]
  }
  newOpenFile.datasets[oldDsStateIdx] = newDsState

  let newOpenFiles = openFiles
    .map(oldOpenFile => oldOpenFile.key == newOpenFile.key ? newOpenFile : oldOpenFile)

  return [newDsState, newOpenFile, newOpenFiles]
}

function ChangeDatasetCwds(
  openFiles: LoadedFileState[],
  fileKey: string,
  dsUuid: PbUuid,
  change: (cwds: ChatWithDetailsPB[]) => ChatWithDetailsPB[]
): [DatasetState, LoadedFileState, LoadedFileState[]] {
  return ChangeDataset(openFiles, fileKey, dsUuid, dsState => {
    return {
      ...dsState,
      cwds: change(dsState.cwds)
    }
  })
}

function DeleteChat(
  cc: CombinedChat,
  dsState: DatasetState,
  services: GrpcServices,
  chatStateCache: ChatStateCache,
  openFiles: LoadedFileState[],
  setOpenFiles: (openFiles: LoadedFileState[]) => void,
  setCurrentFileState: (change: (v: LoadedFileState | null) => (LoadedFileState | null)) => void,
  setCurrentChatState: (change: (v: ChatState | null) => (ChatState | null)) => void
) {
  let innerAsync = async () => {
    await EmitBusy("Deleting...")

    chatStateCache.Clear(dsState.fileKey, cc.dsUuid, cc.mainChatId)

    let removedChatIds = new Set(cc.cwds.map(cwd => cwd.chat!.id))
    let dsUuid = dsState.ds.uuid!

    await services.daoClient.backup({ key: dsState.fileKey, })
    for (let cwd of cc.cwds) {
      await services.daoClient.deleteChat({
        key: dsState.fileKey,
        chat: cwd.chat
      })
    }

    let [_newDsState, newOpenFile, newOpenFiles] =
      ChangeDatasetCwds(openFiles, dsState.fileKey, dsUuid,
        cwds => cwds.filter(cwd => !removedChatIds.has(cwd.chat!.id)))

    setCurrentChatState(chatState => {
      // If the deleted chat is selected, deselect it
      if (
        chatState?.dsState.fileKey == dsState.fileKey &&
        chatState.dsState.ds.uuid!.value == dsUuid.value &&
        chatState.cc.mainChatId == cc.mainChatId
      ) {
        return null
      }
      return chatState
    })

    setCurrentFileState(currentFile => currentFile?.key == newOpenFile.key ? newOpenFile : currentFile)

    setOpenFiles(newOpenFiles)
  }

  PromiseCatchReportError(innerAsync()
    .finally(() => EmitNotBusy()))
}

function SetSecondaryChat(
  cc: CombinedChat,
  dsState: DatasetState,
  newMainId: bigint,
  services: GrpcServices,
  chatStateCache: ChatStateCache,
  reload: (fileKey: string, dsUuid: PbUuid) => Promise<void>
) {
  let innerAsync = async () => {
    await EmitBusy("Updating...")

    chatStateCache.Clear(dsState.fileKey, cc.dsUuid, newMainId)
    chatStateCache.Clear(dsState.fileKey, cc.dsUuid, cc.mainChatId)

    let chat = cc.mainCwd.chat!
    let masterChat = EnsureDefined(dsState.cwds.find(cwd => cwd.chat!.id === newMainId)).chat!
    await services.daoClient.backup({ key: dsState.fileKey, })
    await services.daoClient.combineChats({ key: dsState.fileKey, masterChat, slaveChat: chat })
    await reload(dsState.fileKey, dsState.ds.uuid!)
  }

  PromiseCatchReportError(innerAsync()
    .finally(() => EmitNotBusy()))
}

function ShowCompareChatsPopup(
  masterChat: ChatWithDetailsPB,
  slaveChatId: bigint,
  dsState: DatasetState,
  services: GrpcServices
) {
  let innerAsync = async () => {
    await EmitBusy("Analyzing...")

    const response = await services.mergeClient.analyze({
      masterDaoKey: dsState.fileKey,
      masterDsUuid: dsState.ds.uuid,
      slaveDaoKey: dsState.fileKey,
      slaveDsUuid: dsState.ds.uuid,
      forceConflicts: false,
      chatIdPairs: [{ masterChatId: masterChat.chat!.id, slaveChatId }]
    })
    Assert(response.analysis.length == 1)

    const analysis = response.analysis[0]

    await new Promise(r => setTimeout(r, 2000));

    const serializeState = () => {
      // Cannot pass the payload directly because of BigInt not being serializable by default
      return SerializeJson([dsState, dsState, analysis])
    }
    SpawnPopup<string>("chat-diff-window", "Chat comparison", "/chat/popup_diff",
      screen.availWidth - 100,
      screen.availHeight - 100,
      {
        setState: serializeState
      })
  }

  PromiseCatchReportError(innerAsync()
    .finally(() => EmitNotBusy()))
}

function ExportChatAsHtml(
  cc: CombinedChat,
  dsState: DatasetState,
  services: GrpcServices
) {
  let innerAsync = async () => {
    await EmitBusy("Exporting...")

    // No way to set default name to GetChatPrettyName(chat) :(
    const path = await save({
      filters: [{ name: "HTML page", extensions: ["html"] }],
    });

    if (path) {
      await ExportChatHtml(path, cc, dsState, services)
    }
  }

  PromiseCatchReportError(innerAsync()
    .finally(() => EmitNotBusy()))
}

function CompareDatasetsStart(
  left: DatasetState,
  right: DatasetState,
) {
  // I didn't find a way to disable 60s timeout (at least on Safari webview),
  // so we're using backend to make this request.
  let req: EnsureSameRequest = {
    masterDaoKey: left.fileKey,
    masterDsUuid: left.ds.uuid,
    slaveDaoKey: right.fileKey,
    slaveDsUuid: right.ds.uuid
  }

  let encodedReq = EnsureSameRequest.encode(req).finish()

  // Busy state is managed by Rust here.
  // TODO: Is that what we want?
  InvokeTauri("compare_datasets", { compareRequest: encodedReq })
}

function CompareDatasetsFinish(
  response: EnsureSameResponse,
  alert: (s: AlertDialogState) => void,
) {
  let diffs = response.diffs

  if (diffs.length == 0) {
    alert({
      title: "Datasets are identical",
      content: <p>There are no differences between the datasets</p>
    })
  } else {
    // TODO: Improve a design, and rework the comparison endpoint overall
    alert({
      title: "Datasets differ",
      content: <>
        <p>There are differences between the datasets</p>
        <ScrollArea className="h-[600px] pr-4">
          <ul>
            {diffs.map((diff, idx) =>
              <li key={idx} className="mb-2 break-all">
                <p>{diff.message}</p>
                {diff.values &&
                    <>
                        <p>Was: {diff.values.old}</p>
                        <p>Now: {diff.values.new}</p>
                    </>}
              </li>
            )}
          </ul>
        </ScrollArea>
      </>
    })
  }
}

function MergeDatasets(
  masterDsState: DatasetState,
  slaveDsState: DatasetState,
  newDatabaseDir: string
) {
  let label = "merge-datasets-window";
  SpawnPopup<string>(label, "Select chats to merge", "dataset/popup_merge_datasets",
    screen.availWidth - 100,
    screen.availHeight - 100, {
      setState: () => SerializeJson([masterDsState, slaveDsState, newDatabaseDir]),
      listeners: [
        [DatasetsMergedEvent, async (ev) => {
          let mergeRequest = MergeRequest.fromJSON(ev.payload)
          let encodedMergeRequest = MergeRequest.encode(mergeRequest).finish()
          // This request will be sent by Tauri so it can also update list of open files on its side.
          // This will manage busy state.
          await InvokeTauriAsync("merge_datasets", { mergeRequest: encodedMergeRequest })
        }]
      ]
    })
}

function RenameDatasetComponent(args: {
  renameDatasetState: RenameDatasetState | null
  setRenameDatasetState: (s: RenameDatasetState | null) => void
  openFiles: LoadedFileState[],
  setOpenFiles: (openFiles: LoadedFileState[]) => void,
  currentFileState: LoadedFileState | null,
  setCurrentFileState: (change: (v: LoadedFileState | null) => (LoadedFileState | null)) => void,
}): React.JSX.Element {
  let services = GetServices()

  let onRenameClick =
    React.useCallback<(newName: string, oldState: RenameDatasetState) => Promise<string | null>>(
      (newName, oldState) => {
        let asyncInner = async () => {
          if (newName == oldState.oldName) {
            return "New name should not match an old name"
          }

          if (args.currentFileState?.datasets?.some(ds => ds.ds.alias == newName)) {
            return "Dataset with this name already exists"
          }

          await EmitBusy("Renaming...")

          let [newDsState, newOpenFile, newOpenFiles] =
            ChangeDataset(args.openFiles, oldState.key, oldState.dsUuid, dsState => {
              return {
                ...dsState,
                ds: {
                  ...dsState.ds,
                  alias: newName
                }
              }
            })

          await services.daoClient.backup({ key: oldState.key })
          await services.daoClient.updateDataset({ key: oldState.key, dataset: newDsState.ds })

          args.setCurrentFileState(currentFile => currentFile?.key == newOpenFile.key ? newOpenFile : currentFile)
          args.setOpenFiles(newOpenFiles)
          return null
        }

        return asyncInner()
          .finally(() => EmitNotBusy())
      },
      [args])

  return (
    <InputOverlay
      config={{
        title: "Rename Dataset",
        description: "Pick a new dataset name",
        inputType: "text",
        okButtonLabel: "Rename",
        canBeCancelled: true,
        mutates: true
      }}
      state={args.renameDatasetState}
      stateToInitialValue={s => s.oldName}
      onOkClick={onRenameClick}
      dispose={() => args.setRenameDatasetState(null)}/>
  )
}

function DeleteDataset(
  dsState: DatasetState,
  services: GrpcServices,
  chatStateCache: ChatStateCache,
  openFiles: LoadedFileState[],
  setOpenFiles: (openFiles: LoadedFileState[]) => void,
  setCurrentFileState: (change: (v: LoadedFileState | null) => (LoadedFileState | null)) => void,
  setCurrentChatState: (change: (v: ChatState | null) => (ChatState | null)) => void
) {
  let innerAsync = async () => {
    await EmitBusy("Deleting...")

    let oldOpenFile = EnsureDefined(openFiles.find(f => f.key == dsState.fileKey), "File not found")
    if (oldOpenFile.datasets.length == 1) {
      await message("Cannot delete the last dataset in a file", { title: "Error", kind: "error" })
      return
    }

    let dsUuid = dsState.ds.uuid!
    chatStateCache.Clear(dsState.fileKey, dsUuid.value)

    await services.daoClient.backup({ key: dsState.fileKey, })
    await services.daoClient.deleteDataset({
      key: dsState.fileKey,
      uuid: dsUuid
    })

    let newOpenFile: LoadedFileState = {
      ...oldOpenFile,
      datasets: oldOpenFile.datasets.filter(ds => ds.ds.uuid!.value != dsUuid.value)
    }
    let newOpenFiles = openFiles.map(f => f.key == newOpenFile.key ? newOpenFile : f)

    setCurrentChatState(chatState => {
      // If the deleted chat is selected, deselect it
      if (
        chatState?.dsState.fileKey == dsState.fileKey &&
        chatState.dsState.ds.uuid!.value == dsUuid.value
      ) {
        return null
      }
      return chatState
    })

    setCurrentFileState(currentFile => currentFile?.key == newOpenFile.key ? newOpenFile : currentFile)
    setOpenFiles(newOpenFiles)
  }

  PromiseCatchReportError(innerAsync()
    .finally(() => EmitNotBusy()))
}

function AlertDialogPopup(args: {
  state: AlertDialogState | null,
  setState: (s: AlertDialogState | null) => void
}): React.JSX.Element {
  return (
    <AlertDialog open={!!args.state}>
      <AlertDialogContent className="sm:max-w-[725px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{args.state?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {args.state?.content}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction type="submit" onClick={() => args.setState(null)}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
