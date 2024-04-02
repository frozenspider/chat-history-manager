'use client'

import React from "react";

import ChatComponent from "@/app/chat/chat";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import { ChatViewState, CurrentChatState, LoadedFileState } from "@/app/utils/state";

export default function ChatList(args: {
  fileState: LoadedFileState | null,
  setChatState: (state: CurrentChatState) => void,
  setChatViewState: (viewState: ChatViewState) => void
}): React.JSX.Element {
  if (!args.fileState)
    return <DatsetHeader text="No open files"/>

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
                           setChatState={args.setChatState}
                           setChatViewState={args.setChatViewState}/>
          )

        return [
          <DatsetHeader key={dsState.fileKey} text={dsState.ds.alias}/>,
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
      <h1 className="text-lg font-bold tracking-tighter">{args.text}</h1>
    </div>
  </header>
}
