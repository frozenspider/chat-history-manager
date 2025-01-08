'use client'

import React from "react";
import { emit, emitTo } from "@tauri-apps/api/event";
import { message, save } from "@tauri-apps/plugin-dialog";

import {
  Assert,
  EnsureDefined,
  InvokeTauri,
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
  SetPopupStateEventName,
} from "@/app/utils/state";
import { UserUpdatedEventName } from "@/app/user/manage_users";
import { ChatState, ChatStateCache, ChatStateCacheContext } from "@/app/utils/chat_state";
import { CombinedChat } from "@/app/utils/entity_utils";
import { TestChatState, TestLoadedFiles } from "@/app/utils/test_entities";
import { cn } from "@/lib/utils";

import { PbUuid, User } from "@/protobuf/core/protobuf/entities";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import camelcaseKeysDeep from "camelcase-keys-deep";

import NavigationBar from "@/app/navigation_bar";
import ChatList from "@/app/chat/chat_list";
import MessagesList from "@/app/message/message_list";
import LoadSpinner from "@/app/general/load_spinner";
import UserInputRequsterComponent, { UserInputRequestState } from "@/app/general/user_input_requester";
import { InputOverlay } from "@/app/general/input_overlay";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

  let [renameDatasetState, setRenameDatasetState] = React.useState<RenameDatasetState | null>(null)
  let [shiftDatasetTimeState, setShiftDatasetTimeState] = React.useState<ShiftDatasetTimeState | null>(null)
  let [saveAsState, setSaveAsState] = React.useState<SaveAsState | null>(null)
  let [manageUsersState, setManageUsersState] = React.useState<boolean>(false)
  let [userInputRequestState, setUserInputRequestState] = React.useState<UserInputRequestState | null>(null)
  let [busyState, setBusyState] = React.useState<string | null>(null)

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
      Listen("open-files-changed", () => {
        setLoaded(false)
        PromiseCatchReportError(loadExisting()
          .then(() => setLoaded(true)))
      }),
      Listen<[string, string]>("save-as-clicked", (ev) => {
        let [key, oldName] = ev.payload
        setSaveAsState({ key: key, oldName: oldName })
      }),
      Listen<void>("users-clicked", (_ev) => {
        setManageUsersState(true)
      }),
      Listen<string | null>("busy", (ev) => {
        setBusyState(ev.payload)
      }),
      Listen<Array<object>>("choose-myself", (ev) => {
        let snakeCaseUsers = ev.payload
        let users = snakeCaseUsers.map(camelcaseKeysDeep).map(User.fromJSON)
        setUserInputRequestState({ $case: "choose_myself", users })
      }),
      Listen<string>("ask-for-text", (ev) => {
        let prompt = ev.payload
        setUserInputRequestState({ $case: "ask_for_text", prompt })
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

  let tabs = openFiles.length > 1 ? (
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
  ) : <></>

  return (
    <ServicesContext.Provider value={services}> <ChatStateCacheContext.Provider value={chatStateCache}>
      <div className="mx-auto p-6 md:p-10 flex flex-col h-screen">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={33} minSize={10}>
            <div className="border-r h-full relative flex flex-col">
              <ScrollArea className="w-full rounded-md border">
                {tabs}
                <ScrollBar orientation="horizontal"/>
              </ScrollArea>

              <ScrollArea className="h-full w-full rounded-md border">
                {loaded ?
                  <ChatList fileState={currentFileState}
                            setChatState={setCurrentChatState}
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

      <RenameDatasetComponent renameDatasetState={renameDatasetState}
                              setRenameDatasetState={setRenameDatasetState}
                              openFiles={openFiles}
                              setOpenFiles={setOpenFiles}
                              currentFileState={currentFileState}
                              setCurrentFileState={setCurrentFileState}/>
      <ShiftDatasetTimeComponent shiftDatasetTimeState={shiftDatasetTimeState}
                                 setShiftDatasetTimeState={setShiftDatasetTimeState}
                                 clearCurrentChatState={() => setCurrentChatState(null)}
                                 reload={loadExisting}/>
      <SaveAsComponent saveAsState={saveAsState}
                       setSaveAsState={setSaveAsState}
                       reload={loadExisting}/>
      <UserInputRequsterComponent state={userInputRequestState} setState={setUserInputRequestState}/>
    </ChatStateCacheContext.Provider> </ServicesContext.Provider>
  )
}

interface RenameDatasetState {
  key: string,
  dsUuid: PbUuid,
  oldName: string
}
interface ShiftDatasetTimeState {
  key: string,
  dsUuid: PbUuid
}
interface SaveAsState {
  key: string,
  oldName: string
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

function ShowManageUsersPopup(
  services: GrpcServices,
  openFiles: LoadedFileState[],
  reload: () => void,
) {
  PromiseCatchReportError(async () => {
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
        [UserUpdatedEventName, async (ev) => {
          PromiseCatchReportError(async () => {
            let [newUserObj, dsStateObj] = JSON.parse(ev.payload)
            let newUser = User.fromJSON(newUserObj)
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

            await emitTo(label, SetPopupStateEventName, serializeState(newOpenFiles))
            reload()
          })
        }]
      ]
    })
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
    await emit("busy", true)

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
    .finally(() => emit("busy", false)))
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
    await emit("busy", true)

    chatStateCache.Clear(dsState.fileKey, cc.dsUuid, newMainId)
    chatStateCache.Clear(dsState.fileKey, cc.dsUuid, cc.mainChatId)

    let chat = cc.mainCwd.chat!
    let masterChat = EnsureDefined(dsState.cwds.find(cwd => cwd.chat!.id === newMainId)).chat!
    await services.daoClient.backup({ key: dsState.fileKey, })
    await services.daoClient.combineChats({ key: dsState.fileKey, masterChat, slaveChat: chat })
    await reload(dsState.fileKey, dsState.ds.uuid!)
  }

  PromiseCatchReportError(innerAsync()
    .finally(() => emit("busy", false)))
}

function ShowCompareChatsPopup(
  masterChat: ChatWithDetailsPB,
  slaveChatId: bigint,
  dsState: DatasetState,
  services: GrpcServices
) {
  let innerAsync = async () => {
    await emit("busy", true)

    let slaveChat =
      EnsureDefined(dsState.cwds.find(cwd => cwd.chat!.id == slaveChatId))

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
      return SerializeJson([[masterChat, slaveChat], [dsState, dsState], analysis])
    }
    SpawnPopup<string>("chat-diff-window", "Chat comparison", "/chat/popup_diff",
      screen.availWidth - 100,
      screen.availHeight - 100,
      {
        setState: serializeState
      })
  }

  PromiseCatchReportError(innerAsync()
    .finally(() => emit("busy", false)))
}

function ExportChatAsHtml(
  cc: CombinedChat,
  dsState: DatasetState,
  services: GrpcServices
) {
  let innerAsync = async () => {
    await emit("busy", true)

    // No way to set default name to GetChatPrettyName(chat) :(
    const path = await save({
      filters: [{ name: "HTML page", extensions: ["html"] }],
    });

    if (path) {
      await ExportChatHtml(path, cc, dsState, services)
    }
  }

  PromiseCatchReportError(innerAsync()
    .finally(() => emit("busy", false)))
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
    React.useCallback<(newName: string, oldState: RenameDatasetState) => string | null>(
      (newName, oldState) => {
        if (newName == oldState.oldName) {
          return "New name should not match an old name"
        }

        if (args.currentFileState?.datasets?.some(ds => ds.ds.alias == newName)) {
          return "Dataset with this name already exists"
        }

        let asyncInner = async () => {
          await emit("busy", true)

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
        }

        PromiseCatchReportError(asyncInner()
          .finally(() => emit("busy", false)))
        return null
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
      setState={args.setRenameDatasetState}
      onOkClick={onRenameClick}/>
  )
}

function ShiftDatasetTimeComponent(args: {
  shiftDatasetTimeState: ShiftDatasetTimeState | null,
  setShiftDatasetTimeState: (s: ShiftDatasetTimeState | null) => void,
  clearCurrentChatState: () => void,
  reload: () => Promise<void>,
}) {
  let services = GetServices()
  let chatStateCache = React.useContext(ChatStateCacheContext)!

  let onShiftClick =
    React.useCallback<(newValue: string, oldState: ShiftDatasetTimeState) => string | null>(
      (newValueString, oldState) => {
        if (!/^-?\d*$/.test(newValueString)) {
          return "Provide an integer"
        }

        let newValue = parseInt(newValueString)
        if (newValueString == "" || newValue == 0) {
          return null
        }

        let asyncInner = async () => {
          await emit("busy", true)

          await services.daoClient.backup({ key: oldState.key })
          await services.daoClient.shiftDatasetTime({ key: oldState.key, uuid: oldState.dsUuid, hoursShift: newValue })

          args.clearCurrentChatState()
          chatStateCache.Clear(oldState.key, oldState.dsUuid.value)
          await args.reload()
        }

        PromiseCatchReportError(asyncInner()
          .finally(() => emit("busy", false)))
        return null
      },
      [args])

  return (
    <InputOverlay
      config={{
        title: "Shift Time",
        description: "Choose an hours difference",
        inputType: "integer",
        okButtonLabel: "Shift",
        canBeCancelled: true,
        mutates: true
      }}
      state={args.shiftDatasetTimeState}
      stateToInitialValue={_s => "0"}
      setState={args.setShiftDatasetTimeState}
      onOkClick={onShiftClick}/>
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
    await emit("busy", true)

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
    .finally(() => emit("busy", false)))
}

function SaveAsComponent(args: {
  saveAsState: SaveAsState | null
  setSaveAsState: (s: SaveAsState | null) => void
  reload: () => Promise<void>
}): React.JSX.Element {
  let onSaveClick =
    React.useCallback<(newName: string, oldState: SaveAsState) => string | null>(
      (newName, oldState) => {
        if (newName == oldState.oldName) {
          return "New name should not match an old name"
        }

        InvokeTauri<void>("save_as", {
          key: oldState.key,
          newName: newName
        })

        PromiseCatchReportError(args.reload)
        return null
      },
      [args])

  return (
    <InputOverlay
      config={{
        title: "Save As",
        description: "Pick a new file name",
        inputType: "text",
        okButtonLabel: "Save",
        canBeCancelled: true,
        mutates: false
      }}
      state={args.saveAsState}
      stateToInitialValue={s => s.oldName}
      setState={args.setSaveAsState}
      onOkClick={onSaveClick}/>
  )
}
