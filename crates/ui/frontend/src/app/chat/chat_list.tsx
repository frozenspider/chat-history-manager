'use client'

import React from "react";

import ChatListItem from "@/app/chat/chat_list_item";
import { Deduplicate, EnsureDefined, PromiseCatchReportError } from "@/app/utils/utils";
import { DatasetState, LoadedFileState } from "@/app/utils/state";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import { ChatMatchesString, CombinedChat } from "@/app/utils/entity_utils";
import { ChatState, ChatStateCache, ChatStateCacheContext } from "@/app/utils/chat_state";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import { ask } from "@tauri-apps/plugin-dialog";


export default function ChatList(args: {
  fileState: LoadedFileState | null,
  setChatState: (s: ChatState) => void,
  filterTerm: string,
  callbacks: {
    onRenameDatasetClick: (dsState: DatasetState) => void,
    onShiftDatasetTimeClick: (dsState: DatasetState) => void,
    onDeleteDataset: (dsState: DatasetState) => void,
    onSetSecondary: (cc: CombinedChat, dsState: DatasetState, newMainId: bigint) => void,
    onCompareWith: (cwd: ChatWithDetailsPB, otherChatId: bigint, dsState: DatasetState) => void,
    onExportAsHtml: (cc: CombinedChat, dsState: DatasetState) => void,
    onDeleteChat: (cc: CombinedChat, dsState: DatasetState) => void
  }
}): React.JSX.Element {
  let chatStateCache = React.useContext(ChatStateCacheContext)!

  let [selectedChat, setSelectedChat] =
    React.useState<CombinedChat | null>(null)

  let combinedChatsMap = React.useMemo(() => {
    return new Map(args.fileState ? args.fileState.datasets.map((dsState) => {
      // Combine master/slave chats but preserve chat order
      let mainChatIds = Deduplicate(dsState.cwds.map(cwd => cwd.chat!.mainChatId || cwd.chat!.id))

      let ccs = mainChatIds
        .map(mainChatId => {
          let mainCwd = EnsureDefined(dsState.cwds.find(cwd => cwd.chat!.id === mainChatId))

          let slaveCwds = dsState.cwds
            .filter((cwd) => cwd.chat!.mainChatId === mainCwd.chat!.id)

          return new CombinedChat(mainCwd, slaveCwds)
        })

      return [dsState.ds.uuid!, ccs]
    }) : [])
  }, [args.fileState])

  if (!args.fileState)
    return <DatsetHeader text="No open files"/>

  // TODO: Implement dropdown
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">{
      args.fileState.datasets.map((dsState) => {
        let chatComponents = combinedChatsMap.get(dsState.ds.uuid!)!
          .filter(cc => cc.cwds.some(cwd => ChatMatchesString(cwd, args.filterTerm)))
          .map(cc => {
            return (
              <ChatListItem
                key={dsState.fileKey + "_" + cc.mainChatId.toString()}
                cc={cc}
                dsState={dsState}
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
              <ContextMenuItem className="text-red-600"
                               onClick={() => OnDeleteDatasetClick(dsState, args.callbacks.onDeleteDataset)}>
                Delete
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

function OnDeleteDatasetClick(
  dsState: DatasetState,
  deleteDatasetCallback: (dsState: DatasetState) => void
): void {
  let name = dsState.ds.alias
  PromiseCatchReportError(async () => {
    const agreed = await ask(`Are you sure you want to delete a dataset '${name}'?`, {
      title: 'Delete Dataset',
      kind: 'warning',
    });

    if (agreed) {
      deleteDatasetCallback(dsState)
    }
  })
}

