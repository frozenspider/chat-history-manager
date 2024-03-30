'use client'

import React from "react";

import { ContentPoll } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function MessageContentPoll(args: {
  content: ContentPoll,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  // let path = GetNonDefaultOrNull(content.pathOption);

  // TODO: Implement this!
  return (
    <p>{"(TODO: Poll)"}</p>
  )
}
