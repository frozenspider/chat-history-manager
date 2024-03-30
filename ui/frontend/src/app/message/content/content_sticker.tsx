'use client'

import React from "react";

import { ContentSticker } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import TauriImage from "@/app/utils/tauri_image";

export default function MessageContentSticker(args: {
  content: ContentSticker,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.pathOption);

  if (path?.endsWith(".tgs")) {
    // Telegram animated sticker, not supported
    return <>
      <p>Animated sticker</p>
      <TauriImage relativePath={GetNonDefaultOrNull(content.thumbnailPathOption)}
                  elementName="Sticker"
                  width={content.width}
                  height={content.width}
                  mimeType={null /* unknown */}
                  dsRoot={args.dsRoot}/>
    </>
  } else {
    return (
      <TauriImage relativePath={path}
                  elementName="Sticker"
                  width={content.width}
                  height={content.height}
                  mimeType={null /* unknown */}
                  dsRoot={args.dsRoot}/>
    )
  }
}
