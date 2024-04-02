'use client'

import React from "react";

import MessageTitle from "@/app/message/title";
import MessageTyped from "@/app/message/typed";
import MessageRichText from "@/app/message/rich_text";
import { Message } from "@/protobuf/core/protobuf/entities";
import { AssertDefined, GetNonDefaultOrNull } from "@/app/utils/utils";
import { NameColorClassFromMembers } from "@/app/utils/entity_utils";
import { CurrentChatState } from "@/app/utils/state";

export function MessageComponent(args: {
  msg: Message,
  state: CurrentChatState,
  resolvedMessagesCache: Map<bigint, Message>,
  replyDepth: number
}) {
  let chat = args.state.cwd.chat
  AssertDefined(chat)
  // Author could be outside the chat
  let author = GetNonDefaultOrNull(args.state.dsState.users.get(args.msg.fromId))
  let colorClass = NameColorClassFromMembers(args.msg.fromId, chat.memberIds)

  return (
    <div className="flex flex-col">
      <MessageTitle msg={args.msg}
                    author={author}
                    colorClass={colorClass.text}
                    includeSeconds={false}/>
      <MessageTyped msg={args.msg}
                    borderColorClass={colorClass.border}
                    state={args.state}
                    resolvedMessagesCache={args.resolvedMessagesCache}
                    replyDepth={args.replyDepth}/>
      <MessageRichText msgInternalId={args.msg.internalId}
                       rtes={args.msg.text}
                       borderColorClass={colorClass.border}/>
    </div>
  )
}
