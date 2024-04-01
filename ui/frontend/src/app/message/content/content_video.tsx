'use client'

import React from "react";

import { ContentVideo } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import TauriImage from "@/app/utils/tauri_image";

export default function MessageContentVideo(args: {
  content: ContentVideo,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let thumbnailPath = GetNonDefaultOrNull(content.thumbnailPathOption);

  // TODO: Implement video playback, someday
  return (
    <TauriImage elementName={content.isOneTime ? "One-time video thumbnail" : "Video thumbnail"}
                relativePath={thumbnailPath}
                dsRoot={args.dsRoot}
                width={content.width}
                height={content.height}
                mimeType={null /* unknown */}/>
  )
}
