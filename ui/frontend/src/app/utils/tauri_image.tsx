'use client'

import React from "react";

import Image from "next/image";

import { PlaceholderImage } from "@/app/utils/entity_utils";
import { StaticImport } from "next/dist/shared/lib/get-img-props";
import { InvokeTauri, IsTauriAvailable } from "@/app/utils/utils";

export default function TauriImage(args: {
  relativePath: string | null,
  elementName: string,
  width: number,
  height: number,
  mimeType: string | null,
  dsRoot: string
}): React.JSX.Element {
  let [imageData, setImageData] =
    React.useState<StaticImport | string>(PlaceholderImage)

  if (args.relativePath == null)
    return <>[{args.elementName} not downloaded]</>

  let result: React.JSX.Element
  if (args.width > 0 && args.height > 0) {
    // TODO: Allow clicking to show full-size image
    let width = args.width
    let height = args.height
    while (width > 1024 || height > 512) {
      width /= 2
      height /= 2
    }
    // Workaround as per official docs, see
    // https://nextjs.org/docs/pages/api-reference/components/image#responsive-image-with-fill
    result = (
      <div style={{ position: 'relative', width: width + 'px', height: height + 'px' }}>
        <Image src={imageData}
               alt={args.relativePath}
               onLoad={() => LoadRealImage(args.relativePath!, args.dsRoot, args.mimeType, setImageData)}
               fill/>
      </div>)
  } else {
    result = (
      <Image src={imageData}
             alt={args.relativePath}
             onLoad={() => LoadRealImage(args.relativePath!, args.dsRoot, args.mimeType, setImageData)}/>)
  }
  return result
}

function LoadRealImage(
  relativePath: string,
  dsRoot: string,
  mimeType: string | null,
  setter: (data: string) => void
) {
  if (!IsTauriAvailable()) {
    console.log("Tauri is not available, not loading real image")
    return // Keep placeholder
  }

  if (!mimeType) {
    // Handling some basic MIME types
    if (relativePath.endsWith(".png"))
      mimeType = "image/png"
    else if (relativePath.endsWith(".jpg") || relativePath.endsWith(".jpeg"))
      mimeType = "image/jpeg"
    else if (relativePath.endsWith(".gif"))
      mimeType = "image/gif"
    else if (relativePath.endsWith(".webp"))
      mimeType = "image/webp"
    else if (relativePath.endsWith(".svg"))
      mimeType = "image/svg+xml"
    else
      mimeType = "image/jpeg"
  }

  InvokeTauri<string>("read_file_base64", { relativePath: relativePath, dsRoot: dsRoot }, (data) => {
    setter("data:" + mimeType + ";base64," + data)
  })
}

