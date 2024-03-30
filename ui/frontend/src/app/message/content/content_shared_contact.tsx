'use client'

import React from "react";

import { ContentSharedContact } from "@/protobuf/core/protobuf/entities";
import { CurrentChatState } from "@/app/utils/state";
import { FindMemberIdxByPrettyName, GetUserPrettyName, NameColorClassFromNumber } from "@/app/utils/entity_utils";
import ColoredName from "@/app/message/colored_name";

export default function MessageContentSharedContact(args: {
  content: ContentSharedContact,
  state: CurrentChatState
}): React.JSX.Element {
  let content = args.content

  let contactPrettyName = GetUserPrettyName(content)
  let memberIdx = FindMemberIdxByPrettyName(contactPrettyName, args.state.cwd.members)
  let colorClass = NameColorClassFromNumber(memberIdx).text

  return (
    <blockquote>
      <p><i>Shared contact: </i></p>
      <ColoredName name={contactPrettyName} colorClass={colorClass}/>&nbsp;
      ({content.phoneNumberOption ? "phone: " + content.phoneNumberOption : "no phone number"})
    </blockquote>
  )
}
