'use client'

import React from "react";

import { ContentSharedContact } from "@/protobuf/core/protobuf/entities";
import { CurrentChatState } from "@/app/utils/state";
import { GetUserPrettyName, NameColorClassFromPrettyName } from "@/app/utils/entity_utils";
import ColoredName from "@/app/message/colored_name";

export default function MessageContentSharedContact(args: {
  content: ContentSharedContact,
  state: CurrentChatState
}): React.JSX.Element {
  let content = args.content

  let contactPrettyName = GetUserPrettyName(content)
  let colorClass = NameColorClassFromPrettyName(contactPrettyName, args.state.cwd.members).text

  return (
    <blockquote>
      <p><i>Shared contact: </i></p>
      <ColoredName name={contactPrettyName} colorClass={colorClass}/>&nbsp;
      ({content.phoneNumberOption ? "phone: " + content.phoneNumberOption : "no phone number"})
    </blockquote>
  )
}
