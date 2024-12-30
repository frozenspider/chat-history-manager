import React from "react";

import {
  AssertDefined,
  AssertUnreachable,
  ExpectDefined,
  GetNonDefaultOrNull,
  SerializeJson,
  SpawnPopup,
  Unreachable
} from "@/app/utils/utils";
import { CombinedChat, GetChatPrettyName, GetUserPrettyName, NameColorClassFromNumber } from "@/app/utils/entity_utils";
import { DatasetState, PopupConfirmedEventName } from "@/app/utils/state";

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

export default function ChatComponent(args: {
  cc: CombinedChat,
  dsState: DatasetState,
  setChatState: (s: ChatState) => void,
  isSelected: boolean,
  callbacks: {
    onClick: () => void,
    onDeleteChat: () => void
    onSetSecondary: (newMainId: bigint) => void
  }
}): React.JSX.Element {
  let mainChat = args.cc.mainCwd.chat
  AssertDefined(mainChat)
  let colorClass = NameColorClassFromNumber(mainChat.id).text

  let membersCount = args.cc.mainCwd.chat?.tpe == ChatType.PRIVATE_GROUP ? (
    <div className="pr-2 text-xs">
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

            <ChatAvatar chat={mainChat} dsState={args.dsState}/>

            <div className="w-full">
              <ColoredName name={GetChatPrettyName(mainChat)} colorClass={colorClass}
                           addedClasses="line-clamp-1 break-all"/>
              <SimpleMessage chat={lastMsgCwd?.chat ?? mainChat}
                             msg={lastMsg}
                             users={args.dsState.users}
                             myselfId={args.dsState.myselfId}/>
            </div>

            {membersCount}
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
          <ContextMenuItem>
            Compare [NYI]
          </ContextMenuItem>
          <ContextMenuItem>
            Export As HTML [NYI]
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
  const setStatePromise = async () => {
    // Cannot pass the payload directly because of BigInt not being serializable by default
    return SerializeJson([cc, dsState])
  }
  let name = GetChatPrettyName(cc.mainCwd.chat!)
  SpawnPopup<string>("details-window", name, "/chat/popup_details", 600, 800, setStatePromise())
}

function ShowMakeSecondaryPopup(
  cc: CombinedChat,
  dsState: DatasetState,
  setSecondaryCallback: (newMainId: bigint) => void
) {
  const setStatePromise = async () => {
    // Cannot pass the payload directly because of BigInt not being serializable by default
    return SerializeJson([cc, dsState])
  }
  let name = GetChatPrettyName(cc.mainCwd.chat!)
  let popup =
    SpawnPopup<string>("make-secondary-window", name, "/chat/popup_make_secondary", 600, screen.availHeight - 100,
      setStatePromise(), { y: 50 })

  popup?.once(PopupConfirmedEventName, (ev) => {
    let selectedChatId = ExpectDefined(ev.payload, "Selected main chat ID") as string
    setSecondaryCallback(BigInt(selectedChatId))
  })
}

function DeleteClicked(cc: CombinedChat, deleteChatCallback: () => void) {
  let name = GetChatPrettyName(cc.mainCwd.chat!)

  let inner = async () => {
    const agreed = await ask(`Are you sure you want to delete a chat '${name}'?`, {
      title: 'Delete Chat',
      kind: 'warning',
    });

    if (agreed) {
      deleteChatCallback()
    }
  }
  inner()
}
