import React from "react";

import { GetServices } from "@/app/utils/state";
import { ChatStateCacheContext } from "@/app/utils/chat_state";
import { EmitBusy, EmitNotBusy } from "@/app/utils/utils";
import { InputOverlay } from "@/app/general/input_overlay";
import { PbUuid } from "@/protobuf/core/protobuf/entities";


export interface ShiftDatasetTimeState {
  key: string,
  dsUuid: PbUuid
}

export default function ShiftDatasetTime(args: {
  shiftDatasetTimeState: ShiftDatasetTimeState | null,
  setShiftDatasetTimeState: (s: ShiftDatasetTimeState | null) => void,
  clearCurrentChatState: () => void,
  reload: () => Promise<void>,
}) {
  let services = GetServices()
  let chatStateCache = React.useContext(ChatStateCacheContext)!

  let onShiftClick =
    React.useCallback<(newValue: string, oldState: ShiftDatasetTimeState) => Promise<string | null>>(
      (newValueString, oldState) => {
        let asyncInner = async () => {
          if (!/^-?\d*$/.test(newValueString)) {
            return "Provide an integer"
          }

          let newValue = parseInt(newValueString)
          if (newValueString == "" || newValue == 0) {
            return null
          }

          await EmitBusy("Shifting...")

          await services.daoClient.backup({ key: oldState.key })
          await services.daoClient.shiftDatasetTime({ key: oldState.key, uuid: oldState.dsUuid, hoursShift: newValue })

          args.clearCurrentChatState()
          chatStateCache.Clear(oldState.key, oldState.dsUuid.value)
          await args.reload()
          return null
        }

        return asyncInner().finally(() => EmitNotBusy())
      },
      [args])

  return (
    <InputOverlay
      config={{
        title: "Shift Time",
        description: "Choose an hours difference",
        inputType: "integer",
        okButtonLabel: "Shift",
        canBeCancelled: true,
        mutates: true
      }}
      state={args.shiftDatasetTimeState}
      stateToInitialValue={_s => "0"}
      onOkClick={onShiftClick}
      dispose={() => args.setShiftDatasetTimeState(null)}/>
  )
}
