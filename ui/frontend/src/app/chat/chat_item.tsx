import React from "react";

import {
  AssertDefined,
  AssertUnreachable,
  EnsureDefined,
  GetNonDefaultOrNull,
  PromiseCatchReportError,
  SerializeJson,
  SpawnPopup,
  Unreachable
} from "@/app/utils/utils";
import {
  ChatSourceTypeToString,
  CombinedChat,
  GetChatPrettyName,
  GetChatQualifiedName,
  GetUserPrettyName,
  NameColorClassFromNumber
} from "@/app/utils/entity_utils";
import { DatasetState } from "@/app/utils/state";

import { Chat, ChatType, Message, User } from "@/protobuf/core/protobuf/entities";

import ColoredName from "@/app/message/colored_name";
import { ChatAvatar } from "@/app/chat/chat_avatar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { ChatState } from "@/app/utils/chat_state";
import { ask } from "@tauri-apps/plugin-dialog";
import { Badge } from "@/components/ui/badge";


export default function ChatItem(args: {
  cc: CombinedChat,
  dsState: DatasetState,
  setChatState: (s: ChatState) => void,
  isSelected: boolean,
  callbacks: {
    onClick: () => void,
    onDeleteChat: () => void
    onSetSecondary: (newMainId: bigint) => void
    onCompareWith: (otherChatId: bigint) => void
    onExportAsHtml: () => void
  }
}): React.JSX.Element {
  let mainChat = EnsureDefined(args.cc.mainCwd.chat)
  let colorClass = NameColorClassFromNumber(mainChat.id).text

  let membersCountEl = args.cc.mainCwd.chat?.tpe == ChatType.PRIVATE_GROUP ? (
    <div className="pr-1 text-xs">
      <span>({args.cc.memberIds.length})</span>
    </div>
  ) : <></>

  let [lastMsg, lastMsgCwd] = args.cc.lastMsgOption

  // TODO: Implement dropdown
  return (
    <li className={"p-1.5 cursor-pointer group hover:bg-gray-100 " + (args.isSelected ? "bg-slate-100" : "")}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div className="flex items-center space-x-3"
               onClick={() => args.callbacks.onClick()}>

            <ChatAvatar cc={args.cc} dsState={args.dsState}/>

            <div className="w-full">

              <div className="flex items-center justify-between">
                <ColoredName name={GetChatPrettyName(mainChat)} colorClass={colorClass}
                             addedClasses="line-clamp-1 break-all"/>

                <div className="flex items-center justify-between">
                  {membersCountEl}
                  <Badge variant="outline" className="ml-2 mr-5">
                    {ChatSourceTypeToString(mainChat.sourceType)}
                  </Badge>
                </div>
              </div>
              <div className="pr-2">
                <SimpleMessage chat={lastMsgCwd?.chat ?? mainChat}
                               msg={lastMsg}
                               users={args.dsState.users}
                               myselfId={args.dsState.myselfId}/>
              </div>
            </div>
          </div>
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

function SimpleMessage(args: {
  chat: Chat,
  msg: Message | null,
  users: Map<bigint, User>,
  myselfId: bigint
}) {
  let namePrefix = <></>;
  let text: string = "(no messages yet)"
  if (args.msg) {
    text = GetMessageSimpleText(args.msg)
    if (args.msg.fromId == args.myselfId) {
      namePrefix = <span>You: </span>
    } else if (args.chat.tpe == ChatType.PRIVATE_GROUP) {
      let user = GetNonDefaultOrNull(args.users.get(args.msg.fromId));
      if (user) {
        namePrefix = <span>{GetUserPrettyName(user) + ": "}</span>
      }
    }
  }
  return (
    <p className="text-sm text-gray-500 line-clamp-1 break-all">{namePrefix}{text}</p>
  )
}

function GetMessageSimpleText(msg: Message): string {
  AssertDefined(msg.typed)
  switch (msg.typed.$case) {
    case 'regular': {
      let regular = msg.typed.regular
      if (regular.isDeleted)
        return "(message deleted)"

      let sealed = regular.contents.length > 0 ? regular.contents[0].sealedValueOptional! : null;
      if (!sealed || !sealed?.$case)
        return msg.searchableString

      switch (sealed.$case) {
        case "sticker":
          return sealed.sticker.emojiOption ? sealed.sticker.emojiOption + " (sticker)" : "(sticker)"
        case "photo":
          return "(photo)"
        case "voiceMsg":
          return "(voice message)"
        case "audio":
          return "(audio)"
        case "videoMsg":
          return "(video message)"
        case "video":
          return "(video)"
        case "file":
          return "(file)"
        case "location":
          return "(location)"
        case "poll":
          return "(poll)"
        case "sharedContact":
          return "(shared contact)"
        default:
          AssertUnreachable(sealed)
      }
      return Unreachable() // Cannot be asserted
    }
    case 'service': {
      let sealed = msg.typed.service.sealedValueOptional
      AssertDefined(sealed)
      switch (sealed.$case) {
        case 'phoneCall':
          return "(call)"
        case 'suggestProfilePhoto':
          return "(suggested photo)"
        case 'pinMessage':
          return "(message pinned)"
        case 'clearHistory':
          return "(history cleared)"
        case 'blockUser':
          return "(user " + (sealed.blockUser.isBlocked ? "" : "un") + "blocked)"
        case 'statusTextChanged':
          return "(status) " + msg.searchableString
        case 'notice':
          return "(notice) " + msg.searchableString
        case 'groupCreate':
          return "(group created)"
        case 'groupEditTitle':
          return "(title changed)"
        case 'groupEditPhoto':
          return "(photo changed)"
        case 'groupDeletePhoto':
          return "(photo deleted)"
        case 'groupInviteMembers':
          return "(invited members)"
        case 'groupRemoveMembers':
          return "(removed members)"
        case 'groupMigrateFrom':
          return "(migrated from group)"
        case 'groupMigrateTo':
          return "(migrated to group)"
        case undefined:
          throw Error("Undefined service message type: " + JSON.stringify(sealed))
        default:
          AssertUnreachable(sealed)
      }
      return Unreachable() // Cannot be asserted
    }
    default:
      AssertUnreachable(msg.typed)
  }
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
      let selectedChatId = EnsureDefined(ev.payload, "Selected chat ID to compare with") as string
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
