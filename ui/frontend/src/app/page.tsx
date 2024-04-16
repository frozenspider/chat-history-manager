'use client'

import React from "react";

import NavigationBar from "@/app/navigation_bar";
import ChatList from "@/app/chat/chat_list";
import MessagesList from "@/app/message/message_list";
import LoadSpinner from "@/app/utils/load_spinner";

import { Assert, InvokeTauri, Listen, PromiseCatchReportError } from "@/app/utils/utils";
import {
  DatasetState,
  LoadedFileState,
  NavigationCallbacks,
  ServicesContext,
  ServicesContextType
} from "@/app/utils/state";
import { ChatState, ClearCachedChatState } from "@/app/utils/chat_state";
import { TestChatState, TestLoadedFiles } from "@/app/utils/test_entities";
import { cn } from "@/lib/utils";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input";

import { User } from "@/protobuf/core/protobuf/entities";
import { HistoryDaoServiceDefinition, HistoryLoaderServiceDefinition } from "@/protobuf/backend/protobuf/services";
import { createChannel, createClient } from 'nice-grpc-web';

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

  let [saveAsState, setSaveAsState] = React.useState<SaveAs | null>(null)
  let [busyState, setBusyState] = React.useState<string | null>(null)

  // No-dependency useMemo ensures that the services are created only once
  const services = React.useMemo<ServicesContextType>(() => {
    const channel = createChannel('http://localhost:50051');
    return {
      loadClient: createClient(HistoryLoaderServiceDefinition, channel),
      daoClient: createClient(HistoryDaoServiceDefinition, channel)
    }
  }, [])

  // This cannot be called during prerender as it relies on window object
  React.useEffect(() => {
    if (!firstLoadCalled) {
      let load = async () =>
        LoadExistingData(services, setOpenFiles, setCurrentFileState, setCurrentChatState)

      PromiseCatchReportError(load())
        .then(() => setLoaded(true))

      // Note: we cannot unmount the returned listeners because it's a promise!
      Listen("open-files-changed", () => {
        setLoaded(false)
        PromiseCatchReportError(load())
          .then(() => setLoaded(true))
      })
      Listen<[string, string]>("save-as-clicked", (ev) => {
        let [key, oldName] = ev.payload
        setSaveAsState({ key: key, oldName: oldName })
      })
      Listen<string | null>("busy", (ev) => {
        setBusyState(ev.payload)
      })
      firstLoadCalled = true
    }
  }, [services])

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
    <ServicesContext.Provider value={services}>
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
                            setChatState={setCurrentChatState}/> :
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
                              setNavigationCallbacks={setNavigationCallbacks}/>
                <ScrollBar/>
                <ScrollAreaPrimitive.Corner/>
              </ScrollAreaPrimitive.Root>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <SaveAsComponent saveAsState={saveAsState} setSaveAsState={setSaveAsState}/>
    </ServicesContext.Provider>
  )
}

interface SaveAs {
  key: string,
  oldName: string
}

async function LoadExistingData(
  services: ServicesContextType,
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
          ClearCachedChatState(closed.key)
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

function SaveAsComponent(args: {
  saveAsState: SaveAs | null
  setSaveAsState: (s: SaveAs | null) => void
}): React.JSX.Element {
  let inputRef = React.useRef<HTMLInputElement>(null)

  let onSaveClick = React.useCallback(() => {
    Assert(inputRef.current != null)
    Assert(args.saveAsState != null)
    let newName = inputRef.current.value
    if (newName == args.saveAsState.oldName) {
      // Could show warning but just not closing a dialog is good enough
      return
    }

    InvokeTauri<void>("save_as", {
      key: args.saveAsState.key,
      newName: newName
    })
    args.setSaveAsState(null)
  }, [args.saveAsState])

  return (
    <AlertDialog open={!!args.saveAsState}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save As</AlertDialogTitle>
          <AlertDialogDescription>
            Pick new file name
            <Input ref={inputRef}
                   type="text"
                   placeholder={args.saveAsState?.oldName}
                   defaultValue={args.saveAsState?.oldName}/>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => args.setSaveAsState(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onSaveClick}>Save</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
