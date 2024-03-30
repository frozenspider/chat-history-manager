'use client'

import React from "react";

import { ContentLocation } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function MessageContentLocation(args: {
  content: ContentLocation,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  // let path = GetNonDefaultOrNull(content.pathOption);

  // TODO: Implement this!
  return (
    <p>{"(TODO: Location)"}</p>
  )
}
