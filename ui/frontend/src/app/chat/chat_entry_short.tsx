import React from "react";

import { AssertDefined, AssertUnreachable, EnsureDefined, GetNonDefaultOrNull, Unreachable } from "@/app/utils/utils";
import {
  ChatSourceTypeToString,
  CombinedChat,
  GetChatPrettyName,
  GetUserPrettyName,
  NameColorClassFromNumber
} from "@/app/utils/entity_utils";
import { DatasetState } from "@/app/utils/state";

import { Chat, ChatType, Message, User } from "@/protobuf/core/protobuf/entities";

import ColoredName from "@/app/message/colored_name";
import { ChatAvatar } from "@/app/chat/chat_avatar";
import { Badge } from "@/components/ui/badge";


export default function ChatEntryShort(args: {
  cc: CombinedChat,
  dsState: DatasetState,
  onClick: () => void,
}): React.JSX.Element {
  let mainChat = EnsureDefined(args.cc.mainCwd.chat)
  let colorClass = NameColorClassFromNumber(mainChat.id).text

  let membersCountEl = args.cc.mainCwd.chat?.tpe == ChatType.PRIVATE_GROUP ? (
    <div className="pr-1 text-xs">
      <span>({args.cc.memberIds.length})</span>
    </div>
  ) : <></>

  let [lastMsg, lastMsgCwd] = args.cc.lastMsgOption

  return (
    <div className="flex items-center space-x-3 w-full"
         onClick={args.onClick}>

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
