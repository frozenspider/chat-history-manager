import React from "react";

import { DatasetState } from "@/app/utils/state";
import TauriImage from "@/app/general/tauri_image";

export function Avatar(args: {
  relativePathAsync: () => Promise<string | null>,
  maxSize: number,
  fallback: React.JSX.Element | null
  dsState: DatasetState
}) {
  return (
    <TauriImage elementName="Image"
                relativePathAsync={args.relativePathAsync}
                dsRoot={args.dsState.dsRoot}
                width={args.maxSize}
                height={args.maxSize}
                mimeType={null}
                additional={{
                  altText: "Image",
                  placeholderOverlay: args.fallback ?? undefined,
                  keepPlaceholderOnNull: true,
                  addedClasses: "rounded-md",
                  handleRightClick: false
                }}/>
  )
}
