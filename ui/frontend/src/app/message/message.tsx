'use client'

import React from "react";

import MessageTitle from "@/app/message/title";
import MessageTyped from "@/app/message/typed";
import MessageRichText from "@/app/message/rich_text";
import { Message, User } from "@/protobuf/core/protobuf/entities";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import { AssertDefined } from "@/app/utils";

export function MessageComponent(args: {
  msg: Message,
  cwd: ChatWithDetailsPB,
  users: Map<bigint, User>,
  dsRoot: string
}) {
  return (
    <div className="flex flex-col">
      <MessageTitle msg={args.msg} chat={AssertDefined(args.cwd.chat)} users={args.users} includeSeconds={false}/>
      <MessageTyped msg={args.msg} cwd={args.cwd} dsRoot={args.dsRoot}/>
      <MessageRichText msgInternalId={args.msg.internalId} rtes={args.msg.text}/>
    </div>
  )
}
