'use client'

import React from "react";

import Image from "next/image";

import { PlaceholderImageSvg } from "@/app/utils/entity_utils";
import LazyContent, { LazyDataState } from "@/app/general/lazy_content";
import SystemMessage from "@/app/message/system_message";

const MaxWidth = 1024
const MaxHeight = 768

export default function TauriImage(args: {
  elementName: string,
  relativePathAsync: (() => Promise<string | null>) | null,
  dsRoot: string,
  width: number,
  height: number,
  mimeType: string | null,
  // Optional properties, grouped together for the ease of use
  additional?: TauriImageAdditionalProps
}): React.JSX.Element {
  let mimeType = async (relativePath: string) => {
    if (args.mimeType)
      return args.mimeType
      // Handling some basic MIME types
      if (relativePath.endsWith(".png"))
        return "image/png"
      else if (relativePath.endsWith(".jpg") || relativePath.endsWith(".jpeg"))
        return "image/jpeg"
      else if (relativePath.endsWith(".gif"))
        return "image/gif"
      else if (relativePath.endsWith(".webp"))
        return "image/webp"
      else if (relativePath.endsWith(".svg"))
        return "image/svg+xml"
      else
        return "image/jpeg"
  }

  let maxWidth = args.additional?.maxWidth ?? MaxWidth
  let maxHeight = args.additional?.maxHeight ?? MaxHeight

  return LazyContent(
    args.elementName,
    args.relativePathAsync,
    args.dsRoot,
    mimeType,
    (lazyData) => {
      if (lazyData.state == LazyDataState.Failure) {
        return <SystemMessage>Image loading failed</SystemMessage>
      }
      let isPlaceholder = lazyData.dataUri == null
      let srcToUse = lazyData.dataUri ?? PlaceholderImageSvg
      if (args.width > 0 && args.height > 0) {
        // TODO: Allow clicking to show full-size image
        let width = args.width
        let height = args.height
        while (width > maxWidth || height > maxHeight) {
          width /= 2
          height /= 2
        }
        // TODO: This sometimes triggers warning
        return (
          <div className="relative inline-block" style={{ minWidth: width, minHeight: height }}>
            <Image src={srcToUse}
                   alt={args.additional?.altText ?? ""}
                   className={args.additional?.addedClasses}
                   width={width}
                   height={height}
                   style={{
                     aspectRatio: `${width}/${height}`,
                   }}
                   priority={isPlaceholder}/>
            <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center">
              {isPlaceholder ? args.additional?.placeholderOverlay : null}
            </div>
          </div>
        )
      } else {
        // Workaround as per official docs, see
        // https://nextjs.org/docs/pages/api-reference/components/image#responsive-image-with-fill
        // TODO: Doesn't look good! Image is too large
        return (
          <div style={{ position: "relative", width: maxWidth + "px", height: maxHeight + "px" }}>
            <Image src={srcToUse}
                   alt={args.additional?.altText ?? ""}
                   className={args.additional?.addedClasses}
                   sizes={`${maxWidth}px`}
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
    args.additional?.keepPlaceholderOnNull,
    false /* fetchAssetAsBase64 */
  )
}

export interface TauriImageAdditionalProps {
  altText?: string,
  placeholderOverlay?: React.JSX.Element,
  keepPlaceholderOnNull?: boolean,
  addedClasses?: string
  maxWidth?: number,
  maxHeight?: number
}
