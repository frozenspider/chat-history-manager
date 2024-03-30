'use client'

import React from "react";

import { AssertDefined, AssertUnreachable, GetNonDefaultOrNull } from "@/app/utils/utils";
import { FindMemberIdxByPrettyName, NameColorClassFromNumber, RepliesMaxDepth } from "@/app/utils/entity_utils";
import { CurrentChatState, ServicesContext } from "@/app/utils/state";

import MessageContent from "@/app/message/content/content";
import MessagesLoadSpinner from "@/app/message/load_spinner";

import { Message, MessageRegular, MessageService } from "@/protobuf/core/protobuf/entities";
import { MessageComponent } from "@/app/message/message";
import ColoredName from "@/app/message/colored_name";

export default function MessageTyped(args: {
  msg: Message,
  borderColorClass: string
  replyDepth: number,
  state: CurrentChatState
}): React.JSX.Element {
  switch (args.msg.typed?.$case) {
    case "regular":
      return (
        <MessageTypedRegular msg={args.msg.typed.regular}
                             borderColorClass={args.borderColorClass}
                             state={args.state}
                             replyDepth={args.replyDepth}/>
      )
    case "service":
      return (
        <MessageTypedService msg={args.msg.typed.service}
                             state={args.state}/>
      )
    default:
      throw new Error("Unknown message type " + JSON.stringify(args.msg.typed));
  }
}

function MessageTypedService(args: {
  msg: MessageService,
  state: CurrentChatState
}): React.JSX.Element {
  // FIXME: Replace these placeholders with actual content
  let sealed = args.msg.sealedValueOptional
  AssertDefined(sealed, "MessageService sealed value")
  switch (sealed.$case) {
    case "phoneCall":
      return <p>Phone call</p>
    case "suggestProfilePhoto":
      return <p>Suggest profile photo</p>
    case "pinMessage":
      return <p>Pin message</p>
    case "clearHistory":
      return <p>Clear history</p>
    case "blockUser":
      return <p>Block user</p>
    case "statusTextChanged":
      return <p>Status text changed</p>
    case "notice":
      return <p>Notice</p>
    case "groupCreate":
      return <p>Group create</p>
    case "groupEditTitle":
      return <p>Group edit title</p>
    case "groupEditPhoto":
      return <p>Group edit photo</p>
    case "groupDeletePhoto":
      return <p>Group delete photo</p>
    case "groupInviteMembers":
      return <p>Group invite members</p>
    case "groupRemoveMembers":
      return <p>Group remove members</p>
    case "groupMigrateFrom":
      return <p>Group migrate from</p>
    case "groupMigrateTo":
      return <p>Group migrate to</p>
    default:
      AssertUnreachable(sealed)
  }
}

function MessageTypedRegular(args: {
  msg: MessageRegular,
  borderColorClass: string,
  state: CurrentChatState
  replyDepth: number,
}): React.JSX.Element {
  // null - initial state, not yet loaded
  // string - error message if loading failed, e.g. it wasn't found
  let [replyToMessage, setReplyToMessage] =
    React.useState<Message | string | null>(null)

  let services = React.useContext(ServicesContext)!

  AssertDefined(args.state.cwd.chat)
  let fwdFromName = GetNonDefaultOrNull(args.msg.forwardFromNameOption)
  let fwdFrom = <></>
  if (fwdFromName) {
    let userIndex = FindMemberIdxByPrettyName(fwdFromName, args.state.cwd.members)
    let colorClass = NameColorClassFromNumber(userIndex).text
    fwdFrom = <p>Forwarded from <ColoredName name={fwdFromName} colorClass={colorClass}/></p>
  }

  let replyToId = GetNonDefaultOrNull(args.msg.replyToMessageIdOption)
  let replyTo = <></>
  if (replyToId) {
    let bqClass = "border-l-4 pl-2 " + args.borderColorClass
    if (args.replyDepth > RepliesMaxDepth) {
      replyTo =
        <blockquote className={bqClass}>...</blockquote>
    } else {
      replyTo =
        <blockquote className={bqClass}>
          <ReplyToMessage replyToMsg={replyToMessage} state={args.state} replyDepth={args.replyDepth}/>
        </blockquote>

      // Asynchronously load a message
      services.daoClient.messageOption({
        key: args.state.dsState.fileKey,
        chat: args.state.cwd.chat,
        sourceId: replyToId
      }).then(response => {
        let msg: Message | string | null = GetNonDefaultOrNull(response.message)
        if (!msg) msg = "Message not found"
        setReplyToMessage(msg)
      }).catch(reason => {
        setReplyToMessage("Failed to load message: " + reason)
      })
    }
  }
  return (
    <>
      {fwdFrom}
      {replyTo}
      <MessageContent content={GetNonDefaultOrNull(args.msg.contentOption)} state={args.state}/>
    </>
  )
}

function ReplyToMessage(args: {
  replyToMsg: Message | string | null,
  state: CurrentChatState,
  replyDepth: number
}): React.JSX.Element {
  if (!args.replyToMsg) {
    // Still loading
    return <MessagesLoadSpinner center={false}/>
  }

  if (typeof args.replyToMsg === "string") {
    // Server didn't find a message
    return <>({args.replyToMsg})</>
  }

  return <MessageComponent msg={args.replyToMsg} state={args.state} replyDepth={args.replyDepth + 1}/>
}
