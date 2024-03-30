'use client'

import React from "react";

import ChatComponent from "@/app/chat/chat";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import { LoadedFileState } from "@/app/utils/state";

export default function ChatList(args: {
  openFiles: LoadedFileState[]
}): React.JSX.Element {
  if (args.openFiles.length == 0)
    return <p>No open files</p>

  // FIXME: Handle multiple datasets
  let ds = args.openFiles[0].datasets[0]
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {
        ds.cwds
          .filter((cwd) => {
            if (!cwd.chat) return false
            let mainChatId = GetNonDefaultOrNull(cwd.chat.mainChatId)
            return mainChatId === null
          })
          .map((cwd) =>
            <ChatComponent key={cwd.chat?.id.toString()} cwd={cwd} users={ds.users} myselfId={ds.myselfId}/>
          )
      }
    </ul>
  )
}

