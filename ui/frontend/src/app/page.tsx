'use client'

import React from "react";

import ContactList from "@/app/contact/contact_list";
import MessagesList from "@/app/message/message_list";
import { AssertDefined, WrapPromise } from "@/app/utils/utils";
import { TestCwds, TestDataset, TestMessages, TestUsersMap } from "@/app/utils/test_entities";

import { ScrollArea } from "@/components/ui/scroll-area"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { Message, User } from "@/protobuf/core/protobuf/entities";

import { createChannel, createClient } from 'nice-grpc-web';
import {
  ChatWithDetailsPB,
  HistoryDaoServiceClient,
  HistoryDaoServiceDefinition,
  HistoryLoaderServiceClient,
  HistoryLoaderServiceDefinition,
  LoadedFile
} from "@/protobuf/backend/protobuf/services";

let firstLoadComplete = false;

export default function Home() {
  let [openFiles, setOpenFiles] = React.useState<LoadedFile[]>([])

  // To identify our dataset to the backend, we need (fileKey, dsUuid) pair.
  let [fileKey, setFileKey] = React.useState("<no-file>")
  let [dsUuid, setDsUuid] = React.useState(AssertDefined(TestDataset.uuid).value)
  let [users, setUsers] = React.useState<Map<bigint, User>>(TestUsersMap())
  let [myselfId, setMyselfId] = React.useState<bigint>(BigInt(-1))
  let [cwds, setCwds] = React.useState<ChatWithDetailsPB[]>(TestCwds())
  let [messages, setMessages] = React.useState<Message[]>(() => TestMessages())

  const channel = createChannel('http://localhost:50051');

  const loadClient: HistoryLoaderServiceClient = createClient(
    HistoryLoaderServiceDefinition,
    channel,
  );

  const daoClient: HistoryDaoServiceClient = createClient(
    HistoryDaoServiceDefinition,
    channel
  )

  async function LoadExistingData() {
    let loadedFilesResponse = await loadClient.getLoadedFiles({});
    if (loadedFilesResponse.files.length == 0) {
      console.log("No files open")
      return
    }
    setOpenFiles(loadedFilesResponse.files)
    let file = loadedFilesResponse.files[0]
    setFileKey(file.key)

    let datasetsResponse = await daoClient.datasets({ key: file.key })
    if (datasetsResponse.datasets.length == 0) {
      console.log("No datasets in opened file")
      return
    }
    let ds = datasetsResponse.datasets[0]

    let usersResponse = await daoClient.users({ key: file.key, dsUuid: ds.uuid })
    if (usersResponse.users.length == 0) {
      console.log("No users in dataset")
      return
    }

    setMyselfId(usersResponse.users[0].id)

    // Construct a map of users by id
    let users = new Map<bigint, User>()
    usersResponse.users.forEach((user) => {
      users.set(user.id, user)
    })
    setUsers(users)

    let chatsResponse = await daoClient.chats({ key: file.key, dsUuid: ds.uuid })
    console.log("Got response: ", chatsResponse.cwds)
    setCwds(chatsResponse.cwds)
    console.log("Done!")
  }

  // React.useEffect(() => {
  //   if (!firstLoadComplete) {
  //     firstLoadComplete = true
  //     WrapPromise(LoadExistingData())
  //   }
  // }, [LoadExistingData])

  function SelectChat(cwd: ChatWithDetailsPB) {
    //
  }

  // FIXME: Avoid line breaks on contact list
  return (
    <ResizablePanelGroup className="mx-auto p-6 md:p-10 flex" direction="horizontal">
      <ResizablePanel defaultSize={33} minSize={10}>
        <div className="border-r h-full relative">
          <ScrollArea className="h-96 w-full rounded-md border overflow-y-scroll">
            <ContactList cwds={cwds} users={users} myselfId={myselfId}/>
          </ScrollArea>
        </div>
      </ResizablePanel>
      <ResizableHandle className="w-1 bg-stone-400"/>
      <ResizablePanel defaultSize={67}>
        <ScrollArea className="h-96 w-full rounded-md border overflow-y-scroll">
          <MessagesList dsUuid={dsUuid}
                        fileKey={fileKey}
                        cwd={cwds[0]}
                        messages={messages}
                        users={users}/>
        </ScrollArea>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
