import React from "react";

import { EnsureDefined, PromiseCatchReportError, SerializeJson, SpawnPopup } from "@/app/utils/utils";
import { CombinedChat, GetChatPrettyName, GetChatQualifiedName } from "@/app/utils/entity_utils";
import { DatasetState } from "@/app/utils/state";

import { ChatType } from "@/protobuf/core/protobuf/entities";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { ask } from "@tauri-apps/plugin-dialog";
import ChatEntryShort from "@/app/chat/chat_entry_short";


export default function ChatListItem(args: {
  cc: CombinedChat,
  dsState: DatasetState,
  isSelected: boolean,
  callbacks: {
    onClick: () => void,
    onDeleteChat: () => void
    onSetSecondary: (newMainId: bigint) => void
    onCompareWith: (otherChatId: bigint) => void
    onExportAsHtml: () => void
  }
}): React.JSX.Element {
  return (
    <li className={"p-1.5 cursor-pointer group hover:bg-gray-100 " + (args.isSelected ? "bg-slate-100" : "")}>
      <ContextMenu>
        <ContextMenuTrigger>
          <ChatEntryShort cc={args.cc}
                          dsState={args.dsState}
                          onClick={args.callbacks.onClick}/>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => ShowChatDetailsPopup(args.cc, args.dsState)}>
            Details
          </ContextMenuItem>
          <ContextMenuSeparator/>
          <ContextMenuItem onClick={() => ShowMakeSecondaryPopup(args.cc, args.dsState, args.callbacks.onSetSecondary)}
                           disabled={args.cc.mainCwd.chat!.tpe != ChatType.PERSONAL}>
            Make Secondary
          </ContextMenuItem>
          <ContextMenuItem onClick={() => ShowSelectChatToCompareWithPopup(args.cc, args.dsState, args.callbacks.onCompareWith)}>
            Compare
          </ContextMenuItem>
          <ContextMenuItem onClick={args.callbacks.onExportAsHtml}>
            Export As HTML
          </ContextMenuItem>
          <ContextMenuSeparator/>
          <ContextMenuItem className="text-red-600" onClick={() => DeleteClicked(args.cc, args.callbacks.onDeleteChat)}>
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </li>
  )
}

function ShowChatDetailsPopup(cc: CombinedChat, dsState: DatasetState) {
  let name = GetChatPrettyName(cc.mainCwd.chat!)
  SpawnPopup<string>("details-window", name, "/chat/popup_details", 600, 800, {
    // Cannot pass the payload directly because of BigInt not being serializable by default
    setState: () => SerializeJson([cc, dsState])
  })
}

function ShowMakeSecondaryPopup(
  cc: CombinedChat,
  dsState: DatasetState,
  setSecondaryCallback: (newMainId: bigint) => void
) {
  let name = GetChatPrettyName(cc.mainCwd.chat!)
  SpawnPopup<string>("make-secondary-window", name, "/chat/popup_select_master_chat", 600, screen.availHeight - 100, {
    setState: () => {
      // Cannot pass the payload directly because of BigInt not being serializable by default
      const notice = "Previously selected chat will be combined with the given one and will no longer be shown separately" +
        "in the main list.\n" +
        "For the history merge purposes, chats will remain separate so it will continue to work."
      return SerializeJson([cc, dsState, notice, true /* showPersonalChatsOnly */, true /* isDestructive */])
    },
    onConfirmed: (ev) => {
      let selectedChatId = EnsureDefined(ev.payload, "Selected main chat ID") as string
      setSecondaryCallback(BigInt(selectedChatId))
    }
  })
}

function ShowSelectChatToCompareWithPopup(
  masterCc: CombinedChat,
  dsState: DatasetState,
  onCompareWith: (otherChatId: bigint) => void
) {
  SpawnPopup<string>("select-comparison-chat-window", "Select chat", "/chat/popup_select_master_chat", 600, screen.availHeight - 100, {
    setState: () => {
      // Cannot pass the payload directly because of BigInt not being serializable by default
      const notice = "Select chat to be compared with " + GetChatQualifiedName(masterCc.mainCwd.chat!) + ".\n" +
       "Note that this compares master chats only, slave chats are ignored."
      return SerializeJson([masterCc, dsState, notice, false /* showPersonalChatsOnly */, false /* isDestructive */])
    },
    onConfirmed: (ev) => {
      let selectedChatId = JSON.parse(EnsureDefined(ev.payload, "Selected chat ID to compare with"))
      onCompareWith(BigInt(selectedChatId))
    }
  })
}

function DeleteClicked(cc: CombinedChat, deleteChatCallback: () => void) {
  let name = GetChatPrettyName(cc.mainCwd.chat!)
  PromiseCatchReportError(async () => {
    const agreed = await ask(`Are you sure you want to delete a chat '${name}'?`, {
      title: 'Delete Chat',
      kind: 'warning',
    });

    if (agreed) {
      deleteChatCallback()
    }
  })
}
