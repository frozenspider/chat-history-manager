'use client'

import React from "react";

import MessageTitle from "@/app/message/title";
import MessageTyped from "@/app/message/typed";
import MessageRichText from "@/app/message/rich_text";
import { Chat, Message } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import { NameColorClassFromMembers } from "@/app/utils/entity_utils";
import { ChatState } from "@/app/utils/chat_state";

export function MessageComponent(args: {
  msg: Message,
  chat: Chat,
  chatState: ChatState,
  replyDepth: number
}) {
  // Author could be outside the chat
  let author = GetNonDefaultOrNull(args.chatState.dsState.users.get(args.msg.fromId))
  let colorClass = NameColorClassFromMembers(args.msg.fromId, args.chatState.cc.memberIds)

  // TODO: Limit height/#lines for replyDepth > 0
  // Without overflow-wrap, long unbreakable words (like HTTP links) stretch the message container
  return (
    <div className="flex flex-col pb-4" style={{ overflowWrap: "anywhere" }}>
      <MessageTitle msg={args.msg}
                    author={author}
                    colorClass={colorClass.text}
                    includeSeconds={false}/>
      <MessageTyped msg={args.msg}
                    chat={args.chat}
                    borderColorClass={colorClass.border}
                    chatState={args.chatState}
                    replyDepth={args.replyDepth}/>
      <MessageRichText msgInternalId={args.msg.internalId}
                       rtes={args.msg.text}
                       borderColorClass={colorClass.border}/>
    </div>
  )
}
