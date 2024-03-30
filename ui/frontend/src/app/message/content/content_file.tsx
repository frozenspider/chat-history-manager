'use client'

import React from "react";

import { ContentFile } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function MessageContentFile(args: {
  content: ContentFile,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.pathOption);

  // TODO: Implement this!
  return (
    <p>{"(TODO: File)"}</p>
  )
}
