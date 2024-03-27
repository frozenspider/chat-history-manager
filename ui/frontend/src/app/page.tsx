'use client'

import React from "react";

import { ScrollArea } from "@/components/ui/scroll-area"

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ContactList from "@/app/contact/contact_list";
import MessagesList from "@/app/message/message_list";

import { Chat, ChatWithMessages, Message, User } from "@/protobuf/core/protobuf/entities";

// export default function Home() {
//   return (
//     <main className="flex min-h-screen flex-col items-center justify-between p-24">
//       <TestPopup />
//     </main>
//   )
// }

export interface ChatWithDetails {
  chat: Chat,
  last_msg_option: Message | null,
  members: User[]
}

export default function Home() {
  let dsUuid = "00000-00000-0000"
  let dsRoot = "."
  let chatId = 123456

  function MakeCwd(id: number): ChatWithDetails {
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

  let [cwds, setCwds] = React.useState<ChatWithDetails[]>([])

  Array.from(Array(100).keys()).forEach((i: number) =>
    cwds.push(MakeCwd(i)));

  let [messages, setMessages] = React.useState<Message[]>([])

  let msg = Message.fromJSON({
    "internal_id": 123,
    "source_id_option": 345,
    "timestamp": 1698901234,
    "from_id": 111,
    "text": [
      {"searchable_string": "", "spoiler": {"text": "Spoiler"}},
      {"searchable_string": "", "prefmt_block": {"text": "Prefmt code block"}},
      {"searchable_string": "", "prefmt_inline": {"text": "Inline code block"}},
      {"searchable_string": "", "link": {"href": "https://www.google.com/", "text_option": "My link"}}
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
  messages.push(msg)

  // FIXME: Avoid line breaks on contact list
  return (
    <ResizablePanelGroup className="mx-auto p-6 md:p-10 flex" direction="horizontal">
      <ResizablePanel defaultSize={33} minSize={10}>
        <div className="border-r h-full relative">
          <ScrollArea className="h-96 w-full rounded-md border overflow-y-scroll">
            <ContactList cwds={cwds}/>
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
