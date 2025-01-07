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
import { ChatState, ChatStateCache, ChatStateCacheContext } from "@/app/utils/chat_state";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";


export default function ChatList(args: {
  fileState: LoadedFileState | null,
  setChatState: (s: ChatState) => void,
  callbacks: {
    onRenameDatasetClick: (dsState: DatasetState) => void,
    onShiftDatasetTimeClick: (dsState: DatasetState) => void,
    onDeleteChat: (cc: CombinedChat, dsState: DatasetState) => void
    onSetSecondary: (cc: CombinedChat, dsState: DatasetState, newMainId: bigint) => void,
    onCompareWith: (cwd: ChatWithDetailsPB, otherChatId: bigint, dsState: DatasetState) => void,
    onExportAsHtml: (cc: CombinedChat, dsState: DatasetState) => void
  }
}): React.JSX.Element {
  let chatStateCache = React.useContext(ChatStateCacheContext)!

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
                             callbacks={{
                               onClick: () => {
                                 setSelectedChat(cc)
                                 LoadChat(cc, dsState, args.setChatState, chatStateCache)
                               },
                               onDeleteChat: () => {
                                 args.callbacks.onDeleteChat(cc, dsState)
                               },
                               onSetSecondary: (newMainId: bigint) => {
                                 args.callbacks.onSetSecondary(cc, dsState, newMainId)
                               },
                               onCompareWith: (otherChatId) => {
                                 args.callbacks.onCompareWith(cc.mainCwd, otherChatId, dsState)
                               },
                               onExportAsHtml: () => {
                                 args.callbacks.onExportAsHtml(cc, dsState)
                               }
                             }}/>
            )
          })

        return [
          <ContextMenu key={dsState.fileKey}>
            <ContextMenuTrigger>
              <DatsetHeader text={dsState.ds.alias}/>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => args.callbacks.onRenameDatasetClick(dsState)}>
                Rename
              </ContextMenuItem>
              <ContextMenuItem onClick={() => args.callbacks.onShiftDatasetTimeClick(dsState)}>
                Shift Time
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
  chatStateCache: ChatStateCache
) {
  let cvState = chatStateCache.Get(dsState.fileKey, cc.dsUuid, cc.mainChatId,
    () => new ChatState(cc, dsState))
  setChatState(cvState)
}
