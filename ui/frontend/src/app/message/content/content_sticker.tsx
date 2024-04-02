'use client'

import React from "react";

import { ContentSticker } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import TauriImage from "@/app/utils/tauri_image";
import SystemMessage from "@/app/message/system_message";

export default function MessageContentSticker(args: {
  content: ContentSticker,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.pathOption);

  if (path?.endsWith(".tgs")) {
    // Telegram animated sticker, not supported
    return <>
      <SystemMessage>Animated sticker</SystemMessage>
      <TauriImage elementName="Sticker"
                  relativePath={GetNonDefaultOrNull(content.thumbnailPathOption)}
                  width={content.width / 2}
                  height={content.width / 2}
                  mimeType={null /* unknown */}
                  dsRoot={args.dsRoot}
                  altText={content.emojiOption}/>
    </>
  } else {
    return (
      <TauriImage elementName="Sticker"
                  relativePath={path}
                  dsRoot={args.dsRoot}
                  width={content.width / 2}
                  height={content.height / 2}
                  mimeType={null /* unknown */}
                  altText={content.emojiOption}/>
    )
  }
}
