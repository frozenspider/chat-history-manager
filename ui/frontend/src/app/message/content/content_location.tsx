'use client'

import React from "react";

import { ContentLocation } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function MessageContentLocation(args: {
  content: ContentLocation,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content

  return (
    <blockquote>
      {GetNonDefaultOrNull(content.titleOption) && <p><b>content.titleOption</b></p>}
      {GetNonDefaultOrNull(content.addressOption) && <p>content.addressOption</p>}
      <p><i>Location:</i> <b>{content.latStr}, {content.lonStr}</b></p>
      {GetNonDefaultOrNull(content.durationSecOption) && <p>(live for {content.durationSecOption} s)</p>}
    </blockquote>
  )
}
