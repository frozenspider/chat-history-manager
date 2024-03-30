'use client'

import React from "react";

import { ContentSharedContact } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function MessageContentSharedContact(args: {
  content: ContentSharedContact,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.vcardPathOption);

  // TODO: Implement this!
  return (
    <p>{"(TODO: Shared contact)"}</p>
  )
}
