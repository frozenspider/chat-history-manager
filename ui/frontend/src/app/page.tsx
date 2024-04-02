'use client'

import React from "react";

import ChatList from "@/app/chat/chat_list";
import MessagesList from "@/app/message/message_list";
import { Assert, GetNonDefaultOrNull, WrapPromise } from "@/app/utils/utils";
import {
  CurrentChatState,
  ChatViewState,
  DatasetState,
  LoadedFileState,
  ServicesContext,
  ServicesContextType
} from "@/app/utils/state";
import { TestCwds, TestDataset, TestMessages, TestUsersMap } from "@/app/utils/test_entities";

import { ScrollArea } from "@/components/ui/scroll-area"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { User } from "@/protobuf/core/protobuf/entities";

import { createChannel, createClient } from 'nice-grpc-web';
import {
  ChatWithDetailsPB,
  HistoryDaoServiceDefinition,
  HistoryLoaderServiceDefinition
} from "@/protobuf/backend/protobuf/services";

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
  let [currentChatState, setCurrentChatState] =
    React.useState<CurrentChatState | null>(() => {
      let dsState = GetNonDefaultOrNull(openFiles[0]?.datasets[0])
      let cwd = dsState?.cwds[0]
      return !dsState || !cwd ? null : { cwd: cwd, dsState: dsState }
    })

  let [chatViewState, setChatViewState] = React.useState<ChatViewState>({
    messages: TestMessages(),
    scrollTop: Number.MAX_SAFE_INTEGER,
    beginReached: true,
    endReached: true
  })

  const channel = createChannel('http://localhost:50051');

  const services: ServicesContextType = {
    loadClient: createClient(HistoryLoaderServiceDefinition, channel),
    daoClient: createClient(HistoryDaoServiceDefinition, channel)
  }

  async function LoadExistingData() {
    // Reset open files
    setOpenFiles([])
    // setCurrentChatState(null)

    let loadedFilesResponse = await services.loadClient.getLoadedFiles({});
    if (loadedFilesResponse.files.length == 0) {
      console.log("No files open")
      return
    }

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
    }
    console.log("Done!")
  }

  React.useEffect(() => {
    if (!firstLoadComplete) {
      firstLoadComplete = true
      WrapPromise(LoadExistingData())
    }
  }, [LoadExistingData])

  return (
    <ServicesContext.Provider value={services}>
      <ResizablePanelGroup className="mx-auto p-6 md:p-10 flex" direction="horizontal">
        <ResizablePanel defaultSize={33} minSize={10}>
          <div className="border-r h-full relative">
            <ScrollArea className="h-96 w-full rounded-md border overflow-y-scroll">
              <ChatList openFiles={openFiles}
                        setChatState={setCurrentChatState}
                        setChatViewState={setChatViewState}/>
            </ScrollArea>
          </div>
        </ResizablePanel>
        <ResizableHandle className="w-1 bg-stone-400"/>
        <ResizablePanel defaultSize={67}>
          <ScrollArea className="h-96 w-full rounded-md border overflow-y-scroll">
            <MessagesList state={currentChatState}
                          viewState={chatViewState}/>
          </ScrollArea>
        </ResizablePanel>
      </ResizablePanelGroup>
    </ServicesContext.Provider>
  )
}
