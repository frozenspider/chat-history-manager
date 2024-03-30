'use client'

import React from "react";

import Image from "next/image";
import { ContentPhoto } from "@/protobuf/core/protobuf/entities";
import { PlaceholderImage } from "@/app/utils";

export default function MessageContentPhoto(args: {
  content: ContentPhoto,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = content.pathOption ? args.dsRoot + "/" + content.pathOption : null;
  if (path == null) {
    return <React.Fragment>[Photo not downloaded]</React.Fragment>
  } else {
    // FIXME: Async loading of real image
    if (content.width > 0 && content.height > 0) {
      // Workaround as per official docs, see
      // https://nextjs.org/docs/pages/api-reference/components/image#responsive-image-with-fill
      return <div style={{position: 'relative', width: content.width + 'px', height: content.height + 'px'}}>
        <Image src={/*path ?? */PlaceholderImage}
               alt={path ?? "No path"}
               fill/>
      </div>
    } else {
      return <Image src={/*path ?? */PlaceholderImage}
                    alt={path ?? "No path"}/>
    }
  }
}
