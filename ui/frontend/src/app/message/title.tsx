'use client'

import React from "react";

import { Chat, Message, User } from "@/protobuf/core/protobuf/entities";
import MessageTimestamp from "@/app/message/timestamp";
import { GetNonDefaultOrNull, GetUserPrettyName, NameColorClassFromMembers } from "@/app/utils";

export default function MessageTitle(args: {
  msg: Message,
  chat: Chat,
  users: Map<bigint, User>,
  includeSeconds: boolean
}): React.JSX.Element {
  let regular = args.msg.typed?.$case === 'regular' ? args.msg.typed.regular : null
  let deleted = regular?.isDeleted ?? false

  let user = GetNonDefaultOrNull(args.users.get(args.msg.fromId))
  // TODO: Look at chat members order

  let name = GetUserPrettyName(user);
  let colorClass = user ? NameColorClassFromMembers(args.msg.fromId, args.chat.memberIds) : ""

  return (
    <span className={['font-semibold', colorClass, deleted ? 'line-through' : ''].join(" ")}>
      {name}
      &nbsp;
      <MessageTimestamp timestamp={args.msg.timestamp}
                        editOrDeleteTimestamp={regular?.editTimestampOption}
                        isDeleted={deleted}
                        includeSeconds={false}/>
    </span>
  )
}

