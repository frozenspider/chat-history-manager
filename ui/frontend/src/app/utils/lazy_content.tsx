'use client'

import React from "react";

import { convertFileSrc } from "@tauri-apps/api/core";

import { IsTauriAvailable } from "@/app/utils/utils";
import SystemMessage from "@/app/message/system_message";

export enum LazyDataState {
  NotStarted,
  InProgress,
  Success,
  Failure,
  TauriNotAvailable
}

export interface LazyData {
  state: LazyDataState,
  // Could be a base64-encoded URI (i.e. "data:xxx/xxx;base64,xxxx") as well
  dataUri: string | null
}

/**
 * Lazily load a content from the Tauri backend, returning it as a base64 source string.
 * If Tauri is not available, returns the file URI instead.
 */
export default function LazyContent(
  elementName: string,
  relativePath: string | null,
  dsRoot: string,
  mimeType: string,
  render: (lazyData: LazyData) => React.JSX.Element,
  proceedWithNullPath = false
): React.JSX.Element {
  let [content, setContent] =
    React.useState<LazyData>({ state: LazyDataState.NotStarted, dataUri: null })

  React.useEffect(() => {
    if (content.state == LazyDataState.NotStarted) {
      if (relativePath) {
        LoadRealData(elementName, relativePath, dsRoot, mimeType, setContent)
      } else if (proceedWithNullPath) {
        setContent({ state: LazyDataState.Success, dataUri: null })
      }
    }
  }, [content.state, elementName, relativePath, dsRoot, mimeType, proceedWithNullPath])

  if (!relativePath && !proceedWithNullPath) {
    return <SystemMessage>{elementName} not downloaded</SystemMessage>
  }

  return render(content)
}

function LoadRealData(
  elementName: string,
  relativePath: string,
  dsRoot: string,
  mimeType: string | null,
  setter: (data: LazyData) => void
) {
  if (!IsTauriAvailable()) {
    setter({ state: LazyDataState.TauriNotAvailable, dataUri: null })
    return
  }

  let path = dsRoot + "/" + relativePath
  let assertUri = convertFileSrc(path)

  setter({ state: LazyDataState.Success, dataUri: assertUri })
}
