'use client'

import React from "react";

import {
  AssertDefined,
  AssertUnreachable,
  GetNonDefaultOrNull,
  GetOrInsertDefault,
  SecondsToHhMmSsString
} from "@/app/utils/utils";
import { GetUserPrettyName, NameColorClassFromPrettyName, RepliesMaxDepth } from "@/app/utils/entity_utils";
import { ChatState, MsgSourceId, ServicesContext } from "@/app/utils/state";

import MessagesLoadSpinner from "@/app/utils/load_spinner";
import MessageContent, { MessageContentPhoto } from "@/app/message/content";

import {
  Chat,
  Message,
  MessageRegular,
  MessageService,
  MessageServicePhoneCall,
  User
} from "@/protobuf/core/protobuf/entities";
import { MessageComponent } from "@/app/message/message";
import ColoredName from "@/app/message/colored_name";
import SystemMessage from "@/app/message/system_message";
import ColoredBlockquote from "@/app/message/colored_blockquote";
import ColoredMembersList from "@/app/message/members_list";

export default function MessageTyped(args: {
  msg: Message,
  chat: Chat,
  borderColorClass: string
  chatState: ChatState,
  replyDepth: number
}): React.JSX.Element {
  switch (args.msg.typed?.$case) {
    case "regular":
      return (
        <MessageTypedRegular msg={args.msg.typed.regular}
                             chat={args.chat}
                             borderColorClass={args.borderColorClass}
                             chatState={args.chatState}
                             replyDepth={args.replyDepth}/>
      )
    case "service":
      let authorPrettyName = GetUserPrettyName(GetNonDefaultOrNull(args.chatState.dsState.users.get(args.msg.fromId)))
      return (
        <MessageTypedService msg={args.msg.typed.service}
                             chat={args.chat}
                             borderColorClass={args.borderColorClass}
                             chatState={args.chatState}
                             replyDepth={args.replyDepth}
                             authorPrettyName={authorPrettyName}/>
      )
    default:
      throw new Error("Unknown message type " + JSON.stringify(args.msg.typed));
  }
}

function MessageTypedService(args: {
  msg: MessageService,
  chat: Chat
  borderColorClass: string,
  chatState: ChatState,
  replyDepth: number,
  authorPrettyName: string
}): React.JSX.Element {
  let sealed = args.msg.sealedValueOptional
  AssertDefined(sealed, "MessageService sealed value")
  switch (sealed.$case) {
    case "phoneCall":
      return <ServicePhoneCall call={sealed.phoneCall} members={args.chatState.cc.members}/>
    case "suggestProfilePhoto":
      AssertDefined(sealed.suggestProfilePhoto.photo, "Suggested photo")
      return <>
        <SystemMessage>Suggested profile photo</SystemMessage>
        <MessageContentPhoto content={sealed.suggestProfilePhoto.photo} dsRoot={args.chatState.dsState.dsRoot}/>
      </>
    case "pinMessage":
      return <>
        <SystemMessage>Pinned message</SystemMessage>
        <ColoredBlockquote borderColorClass={args.borderColorClass}>
          <LazyMessageComponent sourceId={sealed.pinMessage.messageSourceId}
                                chat={args.chat}
                                chatState={args.chatState}
                                replyDepth={args.replyDepth + 1}/>
        </ColoredBlockquote>
      </>
    case "clearHistory":
      return <SystemMessage>History cleared</SystemMessage>
    case "blockUser":
      return <SystemMessage>User has been {sealed.blockUser.isBlocked ? "" : "un"}blocked</SystemMessage>
    case "statusTextChanged":
      return <SystemMessage>Status</SystemMessage>
    case "notice":
      return <SystemMessage>Notice</SystemMessage>
    case "groupCreate":
      return <>
        <SystemMessage>Created group <b>{sealed.groupCreate.title}</b></SystemMessage>
        <ColoredMembersList memberNames={sealed.groupCreate.members} members={args.chatState.cc.members}/>
      </>
    case "groupEditTitle":
      return <SystemMessage>Changed group title to <b>{sealed.groupEditTitle.title}</b></SystemMessage>
    case "groupEditPhoto":
      AssertDefined(sealed.groupEditPhoto.photo, "Suggested photo")
      return <>
        <SystemMessage>Changed group photo</SystemMessage>
        <MessageContentPhoto content={sealed.groupEditPhoto.photo} dsRoot={args.chatState.dsState.dsRoot}/>
      </>
    case "groupDeletePhoto":
      return <SystemMessage>Deleted group photo</SystemMessage>
    case "groupInviteMembers":
      return <ServiceInviteRemoveMembers authorPrettyName={args.authorPrettyName}
                                         memberNames={sealed.groupInviteMembers.members}
                                         members={args.chatState.cc.members}
                                         myselfMessage="Joined group"
                                         oneLineMessage={list => <>Invited {list}</>}
                                         multilineMessage="Invited members"/>
    case "groupRemoveMembers":
      return <ServiceInviteRemoveMembers authorPrettyName={args.authorPrettyName}
                                         memberNames={sealed.groupRemoveMembers.members}
                                         members={args.chatState.cc.members}
                                         myselfMessage="Left group"
                                         oneLineMessage={list => <>Removed {list}</>}
                                         multilineMessage="Removed members"/>
    case "groupMigrateFrom":
      return <SystemMessage>Migrated from <b>{sealed.groupMigrateFrom.title}</b></SystemMessage>
    case "groupMigrateTo":
      return <SystemMessage>Migrated to another group</SystemMessage>
    default:
      AssertUnreachable(sealed)
  }
}

function ServicePhoneCall(args: {
  call: MessageServicePhoneCall,
  members: User[]
}): React.JSX.Element {
  let duration = GetNonDefaultOrNull(args.call.durationSecOption)
  let discardReason = GetNonDefaultOrNull(args.call.discardReasonOption)

  let durationNode = <></>
  if (duration) {
    if (duration < 60) {
      durationNode = <> ({duration} sec)</>
    } else {
      durationNode = <> ({SecondsToHhMmSsString(duration)})</>
    }
  }

  return <>
    <SystemMessage>Call{durationNode}{discardReason && discardReason != "hangup" ? ` (${discardReason})` : null}</SystemMessage>
    <ColoredMembersList memberNames={args.call.members} members={args.members}/>
  </>
}

function ServiceInviteRemoveMembers(args: {
  authorPrettyName: string
  memberNames: string[],
  members: User[],
  myselfMessage: string,
  oneLineMessage: (membersList: React.JSX.Element) => React.JSX.Element,
  multilineMessage: string
}): React.JSX.Element {
  if (args.memberNames.length == 1) {
    if (args.memberNames[0] == args.authorPrettyName) {
      return <SystemMessage>{args.myselfMessage}</SystemMessage>
    }
    return <SystemMessage>{
      args.oneLineMessage(<ColoredMembersList memberNames={args.memberNames}
                                              members={args.members}
                                              oneLine={true}/>)
    }</SystemMessage>
  } else {
    return <>
      <SystemMessage>{args.multilineMessage}</SystemMessage>
      <ColoredMembersList memberNames={args.memberNames}
                          members={args.members}/>
    </>
  }
}

function MessageTypedRegular(args: {
  msg: MessageRegular,
  chat: Chat,
  borderColorClass: string,
  chatState: ChatState,
  replyDepth: number,
}): React.JSX.Element {
  let fwdFromName = GetNonDefaultOrNull(args.msg.forwardFromNameOption)
  let fwdFrom = <></>
  if (fwdFromName) {
    let colorClass = NameColorClassFromPrettyName(fwdFromName, args.chatState.cc.members).text
    fwdFrom = <p>Forwarded from <ColoredName name={fwdFromName} colorClass={colorClass}/></p>
  }

  let replyToId = GetNonDefaultOrNull(args.msg.replyToMessageIdOption)
  let replyTo = <></>
  if (replyToId) {
    if (args.replyDepth > RepliesMaxDepth) {
      replyTo =
        <ColoredBlockquote borderColorClass={args.borderColorClass}>...</ColoredBlockquote>
    } else {
      replyTo =
        <ColoredBlockquote borderColorClass={args.borderColorClass}>
          <LazyMessageComponent sourceId={replyToId}
                                chat={args.chat}
                                chatState={args.chatState}
                                replyDepth={args.replyDepth + 1}/>
        </ColoredBlockquote>
    }
  }

  return (
    <>
      {fwdFrom}
      {replyTo}
      <MessageContent content={GetNonDefaultOrNull(args.msg.contentOption)} chatState={args.chatState}/>
    </>
  )
}

/**
 * Renders a message, does so eagerly if it's cached, or lazily if it's not.
 * In the latter case queries the `messageOption` from server and caches the result.
 */
function LazyMessageComponent(args: {
  sourceId: bigint,
  chat: Chat,
  chatState: ChatState,
  replyDepth: number
}): React.JSX.Element {
  let services = React.useContext(ServicesContext)!

  // null - initial state, not yet loaded
  // string - error message if loading failed, e.g. it wasn't found
  let [message, setMessage] =
    React.useState<Message | string | null>(
      args.chatState.resolvedMessages.get(args.chat.id)?.get(args.sourceId) || null
    )

  // Asynchronously load a message
  React.useEffect(() => {
    if (!args.sourceId || message) return

    let fn = async () => {
      let response =
        await services.daoClient.messageOption({
          key: args.chatState.dsState.fileKey,
          chat: args.chat,
          sourceId: args.sourceId
        })

      let msg: Message | string | null = GetNonDefaultOrNull(response.message)
      if (msg) {
        let msgsMap = GetOrInsertDefault(
          args.chatState.resolvedMessages,
          args.chat.id,
          () => new Map<MsgSourceId, Message>()
        )
        msgsMap.set(args.sourceId, msg)
        setMessage(msg)
      } else {
        setMessage("Message not found")
      }
    }
    fn().catch(reason => {
      setMessage("Failed to load message: " + reason)
    })
  }, [args.sourceId, args.chat, args.chatState, args.replyDepth, message, services.daoClient])

  if (!message) {
    // Still loading
    return <MessagesLoadSpinner center={false}/>
  }

  if (typeof message === "string") {
    // Server didn't find a message
    return <>({message})</>
  }

  return <MessageComponent msg={message} chat={args.chat} chatState={args.chatState} replyDepth={args.replyDepth}/>
}
