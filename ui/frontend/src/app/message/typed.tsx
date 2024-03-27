'use client'

import React from "react";

import { GetOrNull } from "@/app/utils";
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
  switch (msg.sealed_value_optional?.$case) {
    case "phone_call":
      return <p>Phone call</p>
    case "suggest_profile_photo":
      return <p>Suggest profile photo</p>
    case "pin_message":
      return <p>Pin message</p>
    case "clear_history":
      return <p>Clear history</p>
    case "block_user":
      return <p>Block user</p>
    case "status_text_changed":
      return <p>Status text changed</p>
    case "notice":
      return <p>Notice</p>
    case "group_create":
      return <p>Group create</p>
    case "group_edit_title":
      return <p>Group edit title</p>
    case "group_edit_photo":
      return <p>Group edit photo</p>
    case "group_delete_photo":
      return <p>Group delete photo</p>
    case "group_invite_members":
      return <p>Group invite members</p>
    case "group_remove_members":
      return <p>Group remove members</p>
    case "group_migrate_from":
      return <p>Group migrate from</p>
    case "group_migrate_to":
      return <p>Group migrate to</p>
    default:
      throw new Error("Unknown service message type " + JSON.stringify(msg.sealed_value_optional));
  }
}


function MessageTypedRegular(msg: MessageRegular, dsRoot: string): React.JSX.Element | null {
  let fwdFromString = GetOrNull(msg.forward_from_name_option)
  let fwdFrom = fwdFromString == null ? null : <p>Forwarded from {fwdFromString}</p>
  return (
    <>
      <div>{fwdFrom}</div>
      <MessageContent content={GetOrNull(msg.content_option)} dsRoot={dsRoot}/>
    </>
  )
}
