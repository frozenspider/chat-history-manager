'use client'

import React from "react";

import ChatComponent from "@/app/chat/chat";
import { AssertDefined, GetNonDefaultOrNull } from "@/app/utils/utils";
import { DatasetState, LoadedFileState } from "@/app/utils/state";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import { CombinedChat } from "@/app/utils/entity_utils";
import { ChatState, GetCachedChatState } from "@/app/utils/chat_state";

export default function ChatList(args: {
  fileState: LoadedFileState | null,
  setChatState: (s: ChatState) => void,
  deleteChatCallback: (cc: CombinedChat, dsState: DatasetState) => void,
}): React.JSX.Element {
  let [selectedChat, setSelectedChat] =
    React.useState<CombinedChat | null>(null)

  if (!args.fileState)
    return <DatsetHeader text="No open files"/>

  // TODO: Implement dropdown
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">{
      args.fileState.datasets.map((dsState) => {
        let chatComponents = dsState.cwds
          .filter((cwd) => {
            AssertDefined(cwd.chat)
            let mainChatId = GetNonDefaultOrNull(cwd.chat.mainChatId)
            return mainChatId === null
          })
          .map((mainCwd) => {
            let slaveCwds = dsState.cwds
              .filter((cwd) => cwd.chat!.mainChatId === mainCwd.chat!.id)

            let cc = new CombinedChat(mainCwd, slaveCwds)
            return (
              <ChatComponent key={dsState.fileKey + "_" + mainCwd.chat!.id.toString()}
                             cc={cc}
                             dsState={dsState}
                             setChatState={args.setChatState}
                             isSelected={cc.dsUuid == selectedChat?.dsUuid && cc.mainChatId == selectedChat.mainChatId}
                             onClick={(cc, dsState) => {
                               setSelectedChat(cc)
                               LoadChat(cc, dsState, args.setChatState)
                             }}
                             deleteChatCallback={() => args.deleteChatCallback(cc, dsState)}/>
            )
          })

        return [
          <ContextMenu key={dsState.fileKey}>
            <ContextMenuTrigger>
              <DatsetHeader text={dsState.ds.alias}/>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => console.log("Clicked")}>
                Rename [NYI]
              </ContextMenuItem>
              <ContextMenuItem>
                Shift Time [NYI]
              </ContextMenuItem>
              <ContextMenuSeparator/>
              <ContextMenuItem className="text-red-600">
                Delete [NYI]
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>,
          ...chatComponents
        ]
      })
    }
    </ul>
  )
}

function DatsetHeader(args: {
  text: string
}): React.JSX.Element {
  return <header className="bg-white dark:bg-gray-900">
    <div className="container mx-auto flex px-10 py-1 justify-center space-x-4">
      <h1 className="text-lg font-bold tracking-tighter line-clamp-1">{args.text}</h1>
    </div>
  </header>
}

function LoadChat(
  cc: CombinedChat,
  dsState: DatasetState,
  setChatState: (state: ChatState) => void,
) {
  let cvState = GetCachedChatState(dsState.fileKey, cc.dsUuid, cc.mainChatId,
    () => new ChatState(cc, dsState))
  setChatState(cvState)
}
