'use client'

import React from "react";

import { AssertDefined, AssertUnreachable, GetOrNull } from "@/app/utils";
import { Message, MessageRegular, MessageService } from "@/protobuf/core/protobuf/entities";
import MessageContent from "@/app/message/content/content";

export default function MessageTyped(args: {
  msg: Message,
  dsRoot: string
}): React.JSX.Element | null {
  switch (args.msg.typed?.$case) {
    case "regular":
      return MessageTypedRegular(args.msg.typed.regular, args.dsRoot);
    case "service":
      return MessageTypedService(args.msg.typed.service, args.dsRoot);
    default:
      throw new Error("Unknown message type " + JSON.stringify(args.msg.typed));
  }
}

function MessageTypedService(msg: MessageService, dsRoot: string): React.JSX.Element | null {
  // FIXME: Replace these placeholders with actual content
  let sealed = AssertDefined(msg.sealedValueOptional)
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


function MessageTypedRegular(msg: MessageRegular, dsRoot: string): React.JSX.Element | null {
  let fwdFromString = GetOrNull(msg.forwardFromNameOption)
  let fwdFrom = fwdFromString == null ? null : <p>Forwarded from {fwdFromString}</p>
  return (
    <>
      <div>{fwdFrom}</div>
      <MessageContent content={GetOrNull(msg.contentOption)} dsRoot={dsRoot}/>
    </>
  )
}
