'use client'

import React from "react";

import { ContentPhoto } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import TauriImage from "@/app/utils/tauri_image";

export default function MessageContentPhoto(args: {
  content: ContentPhoto,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.pathOption);
  return (
    <TauriImage relativePath={path}
                elementName={content.isOneTime ? "One-time photo" : "Photo"}
                width={content.width}
                height={content.height}
                mimeType={null /* unknown */}
                dsRoot={args.dsRoot}/>
  )
}
