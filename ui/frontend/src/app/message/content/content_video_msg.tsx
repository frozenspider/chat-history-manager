'use client'

import React from "react";

import { ContentVideoMsg } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import TauriImage from "@/app/utils/tauri_image";

export default function MessageContentVideoMsg(args: {
  content: ContentVideoMsg,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let thumbnailPath = GetNonDefaultOrNull(content.thumbnailPathOption);

  // TODO: Implement video playback, someday
  return (
    <TauriImage relativePath={thumbnailPath}
                elementName={content.isOneTime ? "Video message thumbnail" : "One-time video message thumbnail"}
                width={content.width}
                height={content.height}
                mimeType={null /* unknown */}
                dsRoot={args.dsRoot}/>
  )
}
