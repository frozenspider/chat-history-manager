'use client'

import React from "react";

import MessageTitle from "@/app/message/title";
import MessageTyped from "@/app/message/typed";
import MessageRichText from "@/app/message/rich_text";
import { Message } from "@/protobuf/core/protobuf/entities";
import { AssertDefined, GetNonDefaultOrNull } from "@/app/utils/utils";
import { NameColorClassFromMembers } from "@/app/utils/entity_utils";
import { ChatState } from "@/app/utils/state";

export function MessageComponent(args: {
  msg: Message,
  chatState: ChatState,
  replyDepth: number
}) {
  let chat = args.chatState.cwd.chat
  AssertDefined(chat)
  // Author could be outside the chat
  let author = GetNonDefaultOrNull(args.chatState.dsState.users.get(args.msg.fromId))
  let colorClass = NameColorClassFromMembers(args.msg.fromId, chat.memberIds)

  return (
    <div className="flex flex-col">
      <MessageTitle msg={args.msg}
                    author={author}
                    colorClass={colorClass.text}
                    includeSeconds={false}/>
      <MessageTyped msg={args.msg}
                    borderColorClass={colorClass.border}
                    chatState={args.chatState}
                    replyDepth={args.replyDepth}/>
      <MessageRichText msgInternalId={args.msg.internalId}
                       rtes={args.msg.text}
                       borderColorClass={colorClass.border}/>
    </div>
  )
}
