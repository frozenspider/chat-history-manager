'use client'

import React from "react";

import Image from "next/image";

import { PlaceholderImageSvg } from "@/app/utils/entity_utils";
import LazyContent from "@/app/utils/lazy_content";

const MaxWidth = 1024
const MaxHeight = 768

export default function TauriImage(args: {
  elementName: string,
  relativePath: string | null,
  dsRoot: string,
  width: number,
  height: number,
  mimeType: string | null,
  altText?: string | null,
  keepPlaceholderOnNull?: boolean,
  addedClasses?: string
}): React.JSX.Element {
  let mimeType = args.mimeType
  if (!mimeType) {
    // Handling some basic MIME types
    if (!args.relativePath)
      mimeType = "image/svg+xml" // Placeholder image type
    else if (args.relativePath.endsWith(".png"))
      mimeType = "image/png"
    else if (args.relativePath.endsWith(".jpg") || args.relativePath.endsWith(".jpeg"))
      mimeType = "image/jpeg"
    else if (args.relativePath.endsWith(".gif"))
      mimeType = "image/gif"
    else if (args.relativePath.endsWith(".webp"))
      mimeType = "image/webp"
    else if (args.relativePath.endsWith(".svg"))
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
      let isPlaceholder = lazyData.data == null
      let srcToUse = lazyData.data ?? PlaceholderImageSvg
      if (args.width > 0 && args.height > 0) {
        // TODO: Allow clicking to show full-size image
        let width = args.width
        let height = args.height
        while (width > MaxWidth || height > MaxHeight) {
          width /= 2
          height /= 2
        }
        // TODO: This sometimes triggers warning
        return (
          <Image src={srcToUse}
                 alt={args.altText ?? args.relativePath!}
                 className={args.addedClasses}
                 width={width}
                 height={height}
                 style={{
                   aspectRatio: `${width}/${height}`,
                 }}
                 priority={isPlaceholder}/>
        )
      } else {
        // Workaround as per official docs, see
        // https://nextjs.org/docs/pages/api-reference/components/image#responsive-image-with-fill
        // TODO: Doesn't look good! Image is too large
        return (
          <div style={{ position: "relative", width: MaxWidth + "px", height: MaxHeight + "px" }}>
            <Image src={srcToUse}
                   alt={args.altText ?? args.relativePath!}
                   className={args.addedClasses}
                   sizes={`${MaxWidth}px`}
                   style={{
                     objectFit: "contain",
                     objectPosition: "left",
                   }}
                   fill
                   priority={isPlaceholder}/>
          </div>
        )
      }
    },
    args.keepPlaceholderOnNull
  )
}
