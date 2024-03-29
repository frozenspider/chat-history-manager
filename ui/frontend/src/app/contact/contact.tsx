'use client'

import React from "react";

import {
  AssertDefined,
  AssertUnreachable,
  GetChatPrettyName,
  GetOrNull,
  GetUserPrettyName,
  NameColorStyleFromNumber
} from "@/app/utils";

import { Chat, ChatType, Message, User } from "@/protobuf/core/protobuf/entities";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";

export default function Contact(args: {
  cwd: ChatWithDetailsPB,
  users: Map<number, User>,
  myselfId: number
}): React.JSX.Element {
  // FIXME: On hover, the dropdown menu should be displayed
  // <div
  //   className="absolute right-0 top-0 hidden group-hover:block bg-white shadow-lg rounded-md mt-2 mr-2 z-10">
  //   <ul className="divide-y divide-gray-200 dark:divide-gray-700">
  //     <li className="p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800">View Contact Details</li>
  //   </ul>
  // </div>
  let chat = AssertDefined(args.cwd.chat);
  let color = NameColorStyleFromNumber(chat.id)

  return (
    <li className="p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 group">
      <div className="flex items-center space-x-3">
        <Avatar chat={chat}/>
        <div>
          <span className={"font-semibold " + color}>{GetChatPrettyName(chat)}</span>
          <SimpleMessage chat={chat}
                         msg={GetOrNull(args.cwd.last_msg_option)}
                         users={args.users}
                         myselfId={args.myselfId}/>
        </div>
      </div>
    </li>
  )
}

function Avatar(args: { chat: Chat }) {
  // TODO: Avatar
  return (
    <img
      alt="User Avatar"
      className="rounded-full"
      height="50"
      src="/placeholder.svg"
      style={{
        aspectRatio: "50/50",
        objectFit: "cover",
      }}
      width="50"
    />
  )
}

function SimpleMessage(args: {
  chat: Chat,
  msg: Message | null,
  users: Map<number, User>,
  myselfId: number
}) {
  let namePrefix = <></>;
  let text: string = "No messages yet"
  if (args.msg) {
    text = GetMessageSimpleText(args.msg)
    if (args.msg.fromId == args.myselfId) {
      namePrefix = <span>You: </span>
    } else if (args.chat.tpe == ChatType.PRIVATE_GROUP) {
      let user = GetOrNull(args.users.get(args.msg.fromId));
      if (user) {
        namePrefix = <span>{GetUserPrettyName(user) + ": "}</span>
      }
    }
  }
  return (
    <p className="text-sm text-gray-500 line-clamp-2">{namePrefix}{text}</p>
  )
}

function GetMessageSimpleText(msg: Message): string {
  if (msg.typed?.$case === 'regular') {
    let regular = msg.typed.regular
    if (regular.is_deleted)
      return "(message deleted)"

    let regularSvo = regular.content_option?.sealed_value_optional;
    if (!regularSvo?.$case)
      return msg.searchable_string

    switch (regularSvo.$case) {
      case "sticker":
        return regularSvo.sticker.emoji_option ? regularSvo.sticker.emoji_option + " (sticker)" : "(sticker)"
      case "photo":
        return "(photo)"
      case "voice_msg":
        return "(voice message)"
      case "audio":
        return "(audio)"
      case "video_msg":
        return "(video message)"
      case "video":
        return "(video)"
      case "file":
        return "(file)"
      case "location":
        return "(location)"
      case "poll":
        return "(poll)"
      case "shared_contact":
        return "(shared contact)"
      default:
        AssertUnreachable(regularSvo)
    }
  } else if (msg.typed?.$case === 'service') {
    let serviceSvo = msg.typed.service.sealed_value_optional
    switch (serviceSvo?.$case) {
      case 'phone_call':
        return "(call)"
      case 'suggest_profile_photo':
        return "(suggested photo)"
      case 'pin_message':
        return "(message pinned)"
      case 'clear_history':
        return "(history cleared)"
      case 'block_user':
        return "(user " + (serviceSvo.block_user.is_blocked ? "" : "un") + "blocked)"
      case 'status_text_changed':
        return "(status) " + msg.searchable_string
      case 'notice':
        return "(notice) " + msg.searchable_string
      case 'group_create':
        return "(group created)"
      case 'group_edit_title':
        return "(title changed)"
      case 'group_edit_photo':
        return "(photo changed)"
      case 'group_delete_photo':
        return "(photo deleted)"
      case 'group_invite_members':
        return "(invited members)"
      case 'group_remove_members':
        return "(removed members)"
      case 'group_migrate_from':
        return "(migrated from group)"
      case 'group_migrate_to':
        return "(migrated to group)"
      case undefined:
        throw new Error("Undefined service message type: " + JSON.stringify(serviceSvo))
      default:
        AssertUnreachable(serviceSvo)
    }
  } else {
    throw new Error("Unexpected message type: " + JSON.stringify(msg))
  }
}

