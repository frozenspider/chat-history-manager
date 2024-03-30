'use client'

import React from "react";

import Image from "next/image";

import { PlaceholderImage } from "@/app/utils/entity_utils";
import { CurrentChatState } from "@/app/utils/state";

import { ContentPhoto } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function MessageContentPhoto(args: {
  content: ContentPhoto,
  state: CurrentChatState
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.pathOption);
  if (path == null) {
    return <>[Photo not downloaded]</>
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
