'use client'

import React from "react";

import { Message, User } from "@/protobuf/core/protobuf/entities";
import MessageTimestamp from "@/app/message/timestamp";
import { GetUserPrettyName } from "@/app/utils/entity_utils";
import ColoredName from "@/app/message/colored_name";

export default function MessageTitle(args: {
  msg: Message,
  author: User | null,
  colorClass: string,
  includeSeconds: boolean
}): React.JSX.Element {
  let regular = args.msg.typed?.$case === 'regular' ? args.msg.typed.regular : null
  let isDeleted = regular?.isDeleted ?? false
  let name = GetUserPrettyName(args.author);

  return (
    <ColoredName name={name} colorClass={args.colorClass} isDeleted={isDeleted}>
      &nbsp;
      <MessageTimestamp timestamp={args.msg.timestamp}
                        editOrDeleteTimestamp={regular?.editTimestampOption}
                        isDeleted={isDeleted}
                        includeSeconds={false}/>
    </ColoredName>
  )
}

