'use client'

import React from "react";

import ContactList from "@/app/contact/contact_list";
import MessagesList from "@/app/message/message_list";
import { WrapPromise } from "@/app/utils";

import { ScrollArea } from "@/components/ui/scroll-area"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { Chat, Message, User } from "@/protobuf/core/protobuf/entities";

import { createChannel, createClient } from 'nice-grpc-web';
import {
  ChatWithDetailsPB,
  HistoryDaoServiceClient,
  HistoryDaoServiceDefinition,
  HistoryLoaderServiceClient,
  HistoryLoaderServiceDefinition
} from "@/protobuf/backend/protobuf/services";

// export default function Home() {
//   return (
//     <main className="flex min-h-screen flex-col items-center justify-between p-24">
//       <TestPopup />
//     </main>
//   )
// }

let firstLoadComplete = false;

export default function Home() {
  let [dsUuid, setDsUuid] = React.useState("00000-00000-0000")
  let [dsRoot, setDsRoot] = React.useState(".")
  let [users, setUsers] = React.useState<Map<number, User>>(new Map())
  let [myselfId, setMyselfId] = React.useState<number>(-1)
  let [cwds, setCwds] = React.useState<ChatWithDetailsPB[]>(() => {
    return Array.from(Array(100).keys()).map((i: number) => MakeCwd(i))
  })
  let [chatId, setChatId] = React.useState(123456)
  let [messages, setMessages] = React.useState<Message[]>(() => {
    let msg = Message.fromJSON({
      "internal_id": 123,
      "source_id_option": 345,
      "timestamp": 1698901234,
      "from_id": 111,
      "text": [
        { "searchable_string": "", "spoiler": { "text": "Spoiler" } },
        { "searchable_string": "", "prefmt_block": { "text": "Prefmt code block" } },
        { "searchable_string": "", "prefmt_inline": { "text": "Inline code block" } },
        { "searchable_string": "", "link": { "href": "https://www.google.com/", "text_option": "My link" } }
      ],
      "searchable_string": "Search me!",
      "regular": {
        "edit_timestamp_option": 1708901234,
        "is_deleted": true,
        "forward_from_name_option": "My name!",
        "reply_to_message_id_option": 4313483375,
        "content_option": {
          "photo": {
            "path_option": "my/file/path",
            "width": 400,
            "height": 100,
            "is_one_time": false
          }
        }
      }
    })
    return [msg]
  })

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
    let file = loadedFilesResponse.files[0]

    let datasetsResponse = await daoClient.datasets({ key: file.key })
    if (datasetsResponse.datasets.length == 0) {
      console.log("No datasets in opened file")
      return
    }
    let ds = datasetsResponse.datasets[0]

    let usersResponse = await daoClient.users({ key: file.key, ds_uuid: ds.uuid })
    if (usersResponse.users.length == 0) {
      console.log("No users in dataset")
      return
    }

    setMyselfId(usersResponse.users[0].id)

    // Construct a map of users by id
    let users = new Map<number, User>()
    usersResponse.users.forEach((user) => {
      users.set(user.id, user)
    })
    setUsers(users)

    let chatsResponse = await daoClient.chats({ key: file.key, ds_uuid: ds.uuid })
    console.log("Got response: ", chatsResponse.cwds)
    setCwds(chatsResponse.cwds)
    console.log("Done!")
  }

  React.useEffect(() => {
    if (!firstLoadComplete) {
      firstLoadComplete = true
      WrapPromise(LoadExistingData())
    }
  }, [LoadExistingData])

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
                        dsRoot={dsRoot}
                        chatId={chatId}
                        messages={messages}/>
        </ScrollArea>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function MakeCwd(id: number): ChatWithDetailsPB {
  return {
    chat: Chat.fromJSON({
      id: id,
      name_option: "John Doe"
    }),
    last_msg_option: Message.fromJSON({
      searchable_string: "Hey there! How can I help you?",
      regular: {}
    }),
    members: []
  }
}
