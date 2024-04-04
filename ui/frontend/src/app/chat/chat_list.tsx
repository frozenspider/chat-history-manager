'use client'

import React from "react";

import ChatComponent from "@/app/chat/chat";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import { ChatState, LoadedFileState } from "@/app/utils/state";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu";

export default function ChatList(args: {
  fileState: LoadedFileState | null,
  setChatState: (s: ChatState) => void,
}): React.JSX.Element {
  if (!args.fileState)
    return <DatsetHeader text="No open files"/>

  // TODO: Implement dropdown
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">{
      args.fileState.datasets.map((dsState) => {
        let chatComponents = dsState.cwds
          .filter((cwd) => {
            if (!cwd.chat) return false
            let mainChatId = GetNonDefaultOrNull(cwd.chat.mainChatId)
            return mainChatId === null
          })
          .map((cwd) =>
            <ChatComponent key={dsState.fileKey + "_" + cwd.chat?.id.toString()}
                           cwd={cwd}
                           dsState={dsState}
                           setChatState={args.setChatState}/>
          )

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
