'use client'

import React from "react";

import { Message } from "@/protobuf/core/protobuf/entities";
import MessageTitle from "@/app/message/title";
import MessageTyped from "@/app/message/typed";
import MessageRichText from "@/app/message/rich_text";

export function MessageComponent(args: {
  msg: Message,
  dsRoot: string
}) {
  return (
    <div className="flex flex-col">
      <MessageTitle msg={args.msg} includeSeconds={false}/>
      <MessageTyped msg={args.msg} dsRoot={args.dsRoot}/>
      <MessageRichText msgInternalId={args.msg.internal_id} rtes={args.msg.text}/>
    </div>
  )
}
