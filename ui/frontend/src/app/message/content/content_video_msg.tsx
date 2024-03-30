'use client'

import React from "react";

import { ContentVideoMsg } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function MessageContentVideoMsg(args: {
  content: ContentVideoMsg,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.pathOption);

  // TODO: Implement this!
  return (
    <p>{"(TODO: Video message)"}</p>
  )
}
