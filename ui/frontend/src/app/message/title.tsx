'use client'

import React from "react";

import { Message, User } from "@/protobuf/core/protobuf/entities";
import MessageTimestamp from "@/app/message/timestamp";
import { GetNonDefaultOrNull, GetUserPrettyName, NameColorClassFromMembers } from "@/app/utils";

export default function MessageTitle(args: {
  msg: Message,
  author: User | null,
  colorClass: string,
  includeSeconds: boolean
}): React.JSX.Element {
  let regular = args.msg.typed?.$case === 'regular' ? args.msg.typed.regular : null
  let deleted = regular?.isDeleted ?? false
  let name = GetUserPrettyName(args.author);

  return (
    <span className={["font-semibold", args.colorClass, deleted ? 'line-through' : ''].join(" ")}>
      {name}
      &nbsp;
      <MessageTimestamp timestamp={args.msg.timestamp}
                        editOrDeleteTimestamp={regular?.editTimestampOption}
                        isDeleted={deleted}
                        includeSeconds={false}/>
    </span>
  )
}

