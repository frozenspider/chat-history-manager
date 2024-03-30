'use client'

import React from "react";

import { ContentPoll } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function MessageContentPoll(args: {
  content: ContentPoll,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content

  return (
    <blockquote>
      <i>Poll:</i> {content.question}
    </blockquote>
  )
}
