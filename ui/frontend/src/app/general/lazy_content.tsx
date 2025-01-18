'use client'

import React from "react";

import { convertFileSrc } from "@tauri-apps/api/core";

import { Assert, IsTauriAvailable, PromiseCatchReportError, ToAbsolutePath } from "@/app/utils/utils";

export type LazyData = {
  state: "not-started",
} | {
  // (As of now, this is not really observable)
  state: "in-progress",
} | {
  state: "success",
  /** Could be a base64-encoded URI (i.e. "data:xxx/xxx;base64,xxxx") as well */
  dataUri: string | null
} | {
  state: "failure",
  error: string
} | {
  state: "system-message",
  text: string // Could be made into React.JSX.Element if needed
} | {
  /** We're in a browser (playground environment) */
  state: "tauri-not-available",
}

/**
 * Lazily load a content from the Tauri backend, returning it as a src string (could be URL or base64 URI).
 * If `fetchAssetAsBase64` is specified, asset will be force-loaded as base64 URI.
 * */
export default function LazyContent(
  elementName: string,
  relativePathAsync: (() => Promise<string | null>) | null,
  dsRoot: string,
  mimeTypeAsync: (relativePath: string) => Promise<string>,
  render: (lazyData: LazyData) => React.JSX.Element,
  proceedWithNullPath = false,
  fetchAssetAsBase64 = false
): React.JSX.Element {
  let [content, setContent] =
    React.useState<LazyData>({ state: "not-started" })

  React.useEffect(() => {
    PromiseCatchReportError(async () => {
      if (content.state == "not-started") {
        setContent({ state: "in-progress" })
        let relativePath = relativePathAsync ? await relativePathAsync() : null
        if (relativePath) {
          let mimeType = await mimeTypeAsync(relativePath)
          await LoadRealDataAsync(relativePath, dsRoot, mimeType, fetchAssetAsBase64, setContent)
        } else if (proceedWithNullPath) {
          setContent({ state: "success", dataUri: null })
        } else {
          setContent({ state: "system-message", text: `${elementName} not downloaded` })
        }
      }
    })
  }, [content.state, elementName, relativePathAsync, dsRoot, mimeTypeAsync, proceedWithNullPath, fetchAssetAsBase64])

  return render(content)
}

async function LoadRealDataAsync(
  relativePath: string | null,
  dsRoot: string,
  // Unused as of now
  _mimeType: string,
  fetchAssetAsBase64: boolean,
  setter: (data: LazyData) => void
) {
  if (!IsTauriAvailable()) {
    setter({ state: "tauri-not-available" })
    return
  }

  let absolutePath = relativePath ? ToAbsolutePath(relativePath, dsRoot) : null
  let assetUri = absolutePath ? convertFileSrc(absolutePath) : null

  if (fetchAssetAsBase64) {
    if (!assetUri) {
      setter({ state: "success", dataUri: null })
      return
    }
    let r = await fetch(assetUri)
    let blob = await r.blob()
    let reader = new FileReader()
    reader.onload = () => {
      Assert(typeof reader.result == "string")
      setter({ state: "success", dataUri: reader.result })
    }
    reader.readAsDataURL(blob)
  } else {
    setter({ state: "success", dataUri: assetUri })
  }
}
