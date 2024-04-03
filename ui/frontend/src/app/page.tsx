'use client'

import React from "react";

import ChatList from "@/app/chat/chat_list";
import MessagesList from "@/app/message/message_list";
import { Assert, GetNonDefaultOrNull, PromiseCatchReportError } from "@/app/utils/utils";
import {
  ChatState,
  ClearCachedChatState,
  DatasetState,
  LoadedFileState,
  ServicesContext,
  ServicesContextType
} from "@/app/utils/state";
import { TestCwds, TestDataset, TestMessages, TestUsersMap } from "@/app/utils/test_entities";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { User } from "@/protobuf/core/protobuf/entities";

import { createChannel, createClient } from 'nice-grpc-web';
import { HistoryDaoServiceDefinition, HistoryLoaderServiceDefinition } from "@/protobuf/backend/protobuf/services";
import NavigationBar from "@/app/navigation_bar";

let firstLoadComplete = false;

export default function Home() {
  let [openFiles, setOpenFiles] =
    React.useState<LoadedFileState[]>([{
      key: "<no-file>",
      name: "<no-name>",
      datasets: [
        {
          fileKey: "<no-file>",
          ds: TestDataset,
          dsRoot: ".",
          users: TestUsersMap(),
          myselfId: BigInt(1),
          cwds: TestCwds()
        },
      ],
    }])
  let [currentFileState, setCurrentFileState] =
    React.useState<LoadedFileState | null>(openFiles[0] ?? null)
  let [currentChatState, setCurrentChatState] =
    React.useState<ChatState | null>(() => {
      let dsState = GetNonDefaultOrNull(openFiles[0]?.datasets[0])
      let cwd = dsState?.cwds[0]
      return !dsState || !cwd ?
        null :
        {
          cwd: cwd,
          dsState: dsState,
          viewState: {
            messages: TestMessages(),
            scrollHeight: 0,
            scrollTop: Number.MAX_SAFE_INTEGER,
            beginReached: true,
            endReached: true
          },
          resolvedMessages: new Map()
        }
    })

  const channel = createChannel('http://localhost:50051');

  const services: ServicesContextType = {
    loadClient: createClient(HistoryLoaderServiceDefinition, channel),
    daoClient: createClient(HistoryDaoServiceDefinition, channel)
  }

  async function LoadExistingData() {
    // Reset open files
    openFiles.forEach(f => ClearCachedChatState(f.key))
    setOpenFiles([])
    // setCurrentChatState(null)
    setCurrentFileState(null)

    let loadedFilesResponse = await services.loadClient.getLoadedFiles({});
    if (loadedFilesResponse.files.length == 0) {
      console.log("No files open")
      return
    }
    let firstFile = true
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

      setOpenFiles((oldState) => [...oldState, fileState])
      if (firstFile) {
        console.log("Setting current file to ", fileState)
        setCurrentFileState(fileState)
        firstFile = false
      }
    }
    console.log("Done fetching initial data")
  }

  React.useEffect(() => {
    if (!firstLoadComplete) {
      firstLoadComplete = true
      PromiseCatchReportError(LoadExistingData())
    }
  }, [LoadExistingData])

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
              <ScrollArea className="w-full rounded-md border overflow-y-scroll">
                {tabs}
                <ScrollBar orientation="horizontal"/>
              </ScrollArea>

              <ScrollArea className="h-full w-full rounded-md border overflow-y-scroll">
                <ChatList fileState={currentFileState}
                          setChatState={setCurrentChatState}/>
              </ScrollArea>
            </div>
          </ResizablePanel>
          <ResizableHandle className="w-1 bg-stone-400"/>
          <ResizablePanel defaultSize={67}>
            <div className="h-full flex flex-col">
              {/*<NavigationBar chatState={currentChatState}/>*/}
              <ScrollArea className="h-full w-full rounded-md border overflow-y-scroll">
                <MessagesList chatState={currentChatState}
                              setChatState={setCurrentChatState}/>
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </ServicesContext.Provider>
  )
}
