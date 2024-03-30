'use client'

import React from "react";

import { ContentAudio } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function MessageContentAudio(args: {
  content: ContentAudio,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.pathOption);

  // TODO: Implement this!
  return (
    <p>{"(TODO: Audio)"}</p>
  )
}
