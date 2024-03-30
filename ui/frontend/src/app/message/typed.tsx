'use client'

import React from "react";

import {
  AssertDefined,
  AssertUnreachable,
  GetNonDefaultOrNull,
  GetUserPrettyName,
  NameColorClassFromMembers
} from "@/app/utils";
import { Chat, Message, MessageRegular, MessageService, User } from "@/protobuf/core/protobuf/entities";
import MessageContent from "@/app/message/content/content";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";

export default function MessageTyped(args: {
  msg: Message,
  cwd: ChatWithDetailsPB,
  dsRoot: string
}): React.JSX.Element | null {
  switch (args.msg.typed?.$case) {
    case "regular":
      return MessageTypedRegular(args.msg.typed.regular, args.cwd, args.dsRoot);
    case "service":
      return MessageTypedService(args.msg.typed.service, args.dsRoot);
    default:
      throw new Error("Unknown message type " + JSON.stringify(args.msg.typed));
  }
}

function MessageTypedService(msg: MessageService, dsRoot: string): React.JSX.Element | null {
  // FIXME: Replace these placeholders with actual content
  let sealed = AssertDefined(msg.sealedValueOptional, "MessageService sealed value")
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


function MessageTypedRegular(msg: MessageRegular, cwd: ChatWithDetailsPB, dsRoot: string): React.JSX.Element | null {
  let fwdFromName = GetNonDefaultOrNull(msg.forwardFromNameOption)
  let fwdFrom = <></>
  if (fwdFromName) {
    let userId = cwd.members.find((u) => GetUserPrettyName(u) == fwdFromName)?.id
    let colorClass = userId ? NameColorClassFromMembers(userId, AssertDefined(cwd.chat).memberIds) : ""
    fwdFrom = <p>Forwarded from <span className={"font-semibold " + colorClass}>{fwdFromName}</span></p>
  }
  return (
    <>
      <div>{fwdFrom}</div>
      <MessageContent content={GetNonDefaultOrNull(msg.contentOption)} dsRoot={dsRoot}/>
    </>
  )
}
