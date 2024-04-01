'use client'

import React from "react";
import { InvokeTauri, IsTauriAvailable } from "@/app/utils/utils";

export enum LazyDataState {
  NotStarted,
  InProgress,
  Success,
  Failure,
  TauriNotAvailable
}

export interface LazyData {
  state: LazyDataState,
  data: string | null
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
    React.useState<LazyData>({ state: LazyDataState.NotStarted, data: null })

  React.useEffect(() => {
    if (content.state == LazyDataState.NotStarted) {
      if (relativePath) {
        LoadRealData(elementName, relativePath, dsRoot, mimeType, setContent)
      } else if (proceedWithNullPath) {
        setContent({ state: LazyDataState.Success, data: null })
      }
    }
  }, [content.state, elementName, relativePath, dsRoot, mimeType, proceedWithNullPath])

  if (!relativePath && !proceedWithNullPath) {
    return <>[{elementName} not downloaded]</>
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
  setter({ state: LazyDataState.InProgress, data: null })

  if (!IsTauriAvailable()) {
    setter({ state: LazyDataState.TauriNotAvailable, data: null })
    return
  }

  InvokeTauri<string>(
    "read_file_base64",
    { relativePath: relativePath, dsRoot: dsRoot },
    data => {
      let base64data = "data:" + mimeType + ";base64," + data
      setter({ state: LazyDataState.Success, data: base64data })
    },
    error => {
      console.log("Failed to load real data for " + elementName.toLowerCase() + ": " + error)
      setter({ state: LazyDataState.Failure, data: null })
    }
  )
}
