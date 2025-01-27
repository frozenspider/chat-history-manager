import React from "react";

import { InvokeTauriAsync } from "@/app/utils/utils";
import { InputOverlay } from "@/app/general/input_overlay";


export interface SaveAsState {
  key: string,
  oldFileName: string
  oldStoragePath: string
}

export default function SaveAs(args: {
  title: string
  saveAsState: SaveAsState | null
  /** `newFullPath` is a full path ending with `newName` */
  onNamePicked: (newName: string, newFullPath: string, oldState: SaveAsState) => Promise<void>
  dispose: () => void
}): React.JSX.Element {
  let onSaveClick =
    React.useCallback<(newName: string, oldState: SaveAsState) => Promise<string | null>>(
      (newName, oldState) => {
        let innerAsync = async () => {
          if (newName == oldState.oldFileName) {
            return "New name should not match an old name"
          }

          if (await InvokeTauriAsync<boolean>("file_exists", {
            relativePath: "../" + newName,
            root: oldState.oldStoragePath
          })) {
            return "Directory already exists"
          }

          let newFullPath = oldState.oldStoragePath + "/../" + newName

          await args.onNamePicked(newName, newFullPath, oldState)
          return null
        }

        return innerAsync()
      },
      [args])

  return (
    <InputOverlay
      config={{
        title: args.title,
        description: "Pick a new file name",
        inputType: "text",
        okButtonLabel: "Save",
        canBeCancelled: true,
        mutates: false
      }}
      state={args.saveAsState}
      stateToInitialValue={s => s.oldFileName}
      onOkClick={onSaveClick}
      dispose={args.dispose}/>
  )
}
