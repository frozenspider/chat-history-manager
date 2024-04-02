'use client'

import React from "react";

import { AssertDefined, AssertUnreachable, GetNonDefaultOrNull, SecondsToHhMmSsString } from "@/app/utils/utils";
import { GetUserPrettyName, NameColorClassFromPrettyName, RepliesMaxDepth } from "@/app/utils/entity_utils";
import { CurrentChatState, ServicesContext } from "@/app/utils/state";

import MessagesLoadSpinner from "@/app/utils/load_spinner";
import MessageContent from "@/app/message/content/content";

import {
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
import MessageContentPhoto from "@/app/message/content/content_photo";

export default function MessageTyped(args: {
  msg: Message,
  borderColorClass: string
  state: CurrentChatState,
  resolvedMessagesCache: Map<bigint, Message>,
  replyDepth: number
}): React.JSX.Element {
  switch (args.msg.typed?.$case) {
    case "regular":
      return (
        <MessageTypedRegular msg={args.msg.typed.regular}
                             borderColorClass={args.borderColorClass}
                             state={args.state}
                             resolvedMessagesCache={args.resolvedMessagesCache}
                             replyDepth={args.replyDepth}/>
      )
    case "service":
      let authorPrettyName = GetUserPrettyName(GetNonDefaultOrNull(args.state.dsState.users.get(args.msg.fromId)))
      return (
        <MessageTypedService msg={args.msg.typed.service}
                             borderColorClass={args.borderColorClass}
                             state={args.state}
                             resolvedMessagesCache={args.resolvedMessagesCache}
                             replyDepth={args.replyDepth}
                             authorPrettyName={authorPrettyName}/>
      )
    default:
      throw new Error("Unknown message type " + JSON.stringify(args.msg.typed));
  }
}

function MessageTypedService(args: {
  msg: MessageService,
  borderColorClass: string,
  state: CurrentChatState,
  resolvedMessagesCache: Map<bigint, Message>,
  replyDepth: number,
  authorPrettyName: string
}): React.JSX.Element {
  let sealed = args.msg.sealedValueOptional
  AssertDefined(sealed, "MessageService sealed value")
  switch (sealed.$case) {
    case "phoneCall":
      return <ServicePhoneCall call={sealed.phoneCall} members={args.state.cwd.members}/>
    case "suggestProfilePhoto":
      AssertDefined(sealed.suggestProfilePhoto.photo, "Suggested photo")
      return <>
        <SystemMessage>Suggested profile photo</SystemMessage>
        <MessageContentPhoto content={sealed.suggestProfilePhoto.photo} dsRoot={args.state.dsState.dsRoot}/>
      </>
    case "pinMessage":
      return <>
        <SystemMessage>Pinned message</SystemMessage>
        <ColoredBlockquote borderColorClass={args.borderColorClass}>
          <LazyMessageComponent sourceId={sealed.pinMessage.messageSourceId}
                                state={args.state}
                                resolvedMessagesCache={args.resolvedMessagesCache}
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
        <ColoredMembersList memberNames={sealed.groupCreate.members} members={args.state.cwd.members}/>
      </>
    case "groupEditTitle":
      return <SystemMessage>Changed group title to <b>{sealed.groupEditTitle.title}</b></SystemMessage>
    case "groupEditPhoto":
      AssertDefined(sealed.groupEditPhoto.photo, "Suggested photo")
      return <>
        <SystemMessage>Changed group photo</SystemMessage>
        <MessageContentPhoto content={sealed.groupEditPhoto.photo} dsRoot={args.state.dsState.dsRoot}/>
      </>
    case "groupDeletePhoto":
      return <SystemMessage>Deleted group photo</SystemMessage>
    case "groupInviteMembers":
      return <ServiceInviteRemoveMembers authorPrettyName={args.authorPrettyName}
                                         memberNames={sealed.groupInviteMembers.members}
                                         members={args.state.cwd.members}
                                         myselfMessage="Joined group"
                                         oneLineMessage={list => <>Invited {list}</>}
                                         multilineMessage="Invited members"/>
    case "groupRemoveMembers":
      return <ServiceInviteRemoveMembers authorPrettyName={args.authorPrettyName}
                                         memberNames={sealed.groupRemoveMembers.members}
                                         members={args.state.cwd.members}
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
      durationNode = <>({duration} sec)</>
    } else {
      durationNode = <>({SecondsToHhMmSsString(duration)})</>
    }
  }

  return <>
    <SystemMessage>Call {durationNode}{discardReason && discardReason != "hangup" ? `(${discardReason})` : null}</SystemMessage>
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
  borderColorClass: string,
  state: CurrentChatState,
  resolvedMessagesCache: Map<bigint, Message>,
  replyDepth: number,
}): React.JSX.Element {
  AssertDefined(args.state.cwd.chat)
  let fwdFromName = GetNonDefaultOrNull(args.msg.forwardFromNameOption)
  let fwdFrom = <></>
  if (fwdFromName) {
    let colorClass = NameColorClassFromPrettyName(fwdFromName, args.state.cwd.members).text
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
                                state={args.state}
                                resolvedMessagesCache={args.resolvedMessagesCache}
                                replyDepth={args.replyDepth + 1}/>
        </ColoredBlockquote>
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

/**
 * Renders a message, does so eagerly if it's cached, or lazily if it's not.
 * In the latter case queries the `messageOption` from server and caches the result.
 */
function LazyMessageComponent(args: {
  sourceId: bigint,
  state: CurrentChatState,
  resolvedMessagesCache: Map<bigint, Message>,
  replyDepth: number
}): React.JSX.Element {
  let services = React.useContext(ServicesContext)!

  // null - initial state, not yet loaded
  // string - error message if loading failed, e.g. it wasn't found
  let [message, setMessage] =
    React.useState<Message | string | null>(args.resolvedMessagesCache.get(args.sourceId) || null)

  // Asynchronously load a message
  React.useEffect(() => {
    if (!args.sourceId || message) return
    services.daoClient.messageOption({
      key: args.state.dsState.fileKey,
      chat: args.state.cwd.chat,
      sourceId: args.sourceId
    }).then(response => {
      let msg: Message | string | null = GetNonDefaultOrNull(response.message)
      if (msg) {
        args.resolvedMessagesCache.set(args.sourceId, msg)
        setMessage(msg)
      } else {
        setMessage("Message not found")
      }
    }).catch(reason => {
      setMessage("Failed to load message: " + reason)
    })
  }, [args.sourceId, args.replyDepth])

  if (!message) {
    // Still loading
    return <MessagesLoadSpinner center={false}/>
  }

  if (typeof message === "string") {
    // Server didn't find a message
    return <>({message})</>
  }

  return <MessageComponent msg={message} state={args.state} resolvedMessagesCache={args.resolvedMessagesCache}
                           replyDepth={args.replyDepth}/>
}
