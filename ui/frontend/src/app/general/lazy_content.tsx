'use client'

import React from "react";

import { convertFileSrc } from "@tauri-apps/api/core";

import { Assert, IsTauriAvailable, PromiseCatchReportError, ToAbsolutePath } from "@/app/utils/utils";
import SystemMessage from "@/app/message/system_message";

export enum LazyDataState {
  NotStarted,
  // (As of now, this is not really observable)
  InProgress,
  Success,
  Failure,
  /** We're in a browser (playground environment) */
  TauriNotAvailable
}

export interface LazyData {
  state: LazyDataState,
  /** Could be a base64-encoded URI (i.e. "data:xxx/xxx;base64,xxxx") as well. Mutually exclusive with `error`. */
  dataUri: string | null,
  /** Will only be not null on `Failure` state */
  error: string | null
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
    React.useState<LazyData>({ state: LazyDataState.NotStarted, dataUri: null, error: null })

  React.useEffect(() => {
    if (content.state == LazyDataState.NotStarted) {
      setContent({ state: LazyDataState.InProgress, dataUri: null, error: null })
      if (relativePathAsync) {
        LoadRealData(relativePathAsync, dsRoot, mimeTypeAsync, fetchAssetAsBase64, setContent)
      } else if (proceedWithNullPath) {
        setContent({ state: LazyDataState.Success, dataUri: null, error: null })
      }
    }
  }, [content.state, elementName, relativePathAsync, dsRoot, mimeTypeAsync, proceedWithNullPath, fetchAssetAsBase64])

  if (!relativePathAsync && !proceedWithNullPath) {
    return <SystemMessage>{elementName} not downloaded</SystemMessage>
  }

  return render(content)
}

function LoadRealData(
  relativePathAsync: () => Promise<string | null>,
  dsRoot: string,
  // Unused as of now
  _mimeTypeAsync: (relativePath: string) => Promise<string>,
  fetchAssetAsBase64: boolean,
  setter: (data: LazyData) => void
) {
  if (!IsTauriAvailable()) {
    setter({ state: LazyDataState.TauriNotAvailable, dataUri: null, error: null })
    return
  }

  let assetUriAsync = async () => {
    let relativePath = await relativePathAsync()
    if (!relativePath)
      return null;
    let absolutePath = ToAbsolutePath(relativePath, dsRoot)
    return convertFileSrc(absolutePath)
  }

  if (fetchAssetAsBase64) {
    PromiseCatchReportError(async () => {
      let assertUri = await assetUriAsync()
      if (!assertUri) {
        setter({ state: LazyDataState.Success, dataUri: null, error: null })
        return
      }
      let r = await fetch(assertUri)
      let blob = await r.blob()
      let reader = new FileReader()
      reader.onload = () => {
        Assert(typeof reader.result == "string")
        setter({ state: LazyDataState.Success, dataUri: reader.result, error: null })
      }
      reader.readAsDataURL(blob)
    })
  } else {
    PromiseCatchReportError(async () => {
      let assertUri = await assetUriAsync()
      setter({ state: LazyDataState.Success, dataUri: assertUri, error: null })
    })
  }
}
