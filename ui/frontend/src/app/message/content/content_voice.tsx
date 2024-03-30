'use client'

import React from "react";

import { ContentVoiceMsg } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function MessageContentVoiceMsg(args: {
  content: ContentVoiceMsg,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.pathOption);

  // TODO: Implement this!
  return (
    <p>{"(TODO: Voice message)"}</p>
  )
}
