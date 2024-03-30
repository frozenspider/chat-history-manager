'use client'

import React from "react";

import { Message } from "@/protobuf/core/protobuf/entities";
import MessageTimestamp from "@/app/message/timestamp";
import { NameColorStyleFromNumber } from "@/app/utils";

export default function MessageTitle(args: {
  msg: Message,
  includeSeconds: boolean
}): React.JSX.Element {
  let regular = args.msg.typed?.$case === 'regular' ? args.msg.typed.regular : null
  let deleted = regular?.isDeleted ?? false

  // TODO: Look at chat members order
  let color = NameColorStyleFromNumber(args.msg.fromId)

  return (
    <span className={['font-semibold', color, deleted ? 'line-through' : ''].join(" ")}>
      John Doe
      &nbsp;
      <MessageTimestamp timestamp={args.msg.timestamp}
                        editOrDeleteTimestamp={regular?.editTimestampOption}
                        isDeleted={deleted}
                        includeSeconds={false}/>
    </span>
  )
}

