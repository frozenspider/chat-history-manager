'use client'

import React from "react";

import { ContentFile } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import TauriImage from "@/app/utils/tauri_image";
import { Unnamed } from "@/app/utils/entity_utils";

export default function MessageContentFile(args: {
  content: ContentFile,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let thumbnailPath = GetNonDefaultOrNull(content.thumbnailPathOption);

  if (thumbnailPath) {
    return (
      <TauriImage elementName={"File thumbnail"}
                  relativePath={thumbnailPath}
                  dsRoot={args.dsRoot}
                  width={0 /* unknown */}
                  height={0 /* unknown */}
                  mimeType={null /* unknown */}/>
    )
  } else {
    return (
      <blockquote><i>File:</i> <b>{content.fileNameOption || Unnamed}</b></blockquote>
    )
  }
}
