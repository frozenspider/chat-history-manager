'use client'

import React from "react";

import Image from "next/image";

import { PlaceholderImage } from "@/app/utils/entity_utils";
import LazyContent from "@/app/utils/lazy_content";

export default function TauriImage(args: {
  elementName: string,
  relativePath: string | null,
  dsRoot: string,
  width: number,
  height: number,
  mimeType: string | null,
  altText?: string | null
}): React.JSX.Element {
  let mimeType = args.mimeType
  if (!mimeType) {
    // Handling some basic MIME types
    if (args.relativePath?.endsWith(".png"))
      mimeType = "image/png"
    else if (args.relativePath?.endsWith(".jpg") || args.relativePath?.endsWith(".jpeg"))
      mimeType = "image/jpeg"
    else if (args.relativePath?.endsWith(".gif"))
      mimeType = "image/gif"
    else if (args.relativePath?.endsWith(".webp"))
      mimeType = "image/webp"
    else if (args.relativePath?.endsWith(".svg"))
      mimeType = "image/svg+xml"
    else
      mimeType = "image/jpeg"
  }

  return LazyContent(
    args.elementName,
    args.relativePath,
    args.dsRoot,
    mimeType,
    (lazyData) => {
      let srcToUse = lazyData.data ?? PlaceholderImage
      if (args.width > 0 && args.height > 0) {
        // TODO: Allow clicking to show full-size image
        let width = args.width
        let height = args.height
        while (width > 1024 || height > 768) {
          width /= 2
          height /= 2
        }
        // Workaround as per official docs, see
        // https://nextjs.org/docs/pages/api-reference/components/image#responsive-image-with-fill
        return (
          <div style={{ position: 'relative', width: width + 'px', height: height + 'px' }}>
            <Image src={srcToUse}
                   alt={args.altText ?? args.relativePath!}
                   fill/>
          </div>)
      } else {
        return (
          <Image src={srcToUse}
                 alt={args.altText ?? args.relativePath!}/>)
      }
    }
  )
}
