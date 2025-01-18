import React from "react";
import { Assert, AssertUnreachable, PromiseCatchReportError } from "@/app/utils/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

type InputType = "text" | "integer"
type ErrorMessage = string

export function InputOverlay<S>(args: {
  config: {
    title: string,
    description: string,
    inputType: InputType,
    okButtonLabel: string
    canBeCancelled: boolean
    mutates: boolean
  }
  state: S | null
  stateToInitialValue: (s: S) => string
  onOkClick: (newValue: string, oldState: S) => Promise<ErrorMessage | null>
  dispose: () => void
}): React.JSX.Element {
  let [errorMessage, setErrorMessage] =
    React.useState<ErrorMessage | null>(null)

  let inputRef =
    React.useRef<HTMLInputElement>(null)

  let onOkClick = React.useCallback(() => {
    Assert(inputRef.current != null)
    Assert(args.state != null)
    let state = args.state
    let newValue = inputRef.current.value
    PromiseCatchReportError(async () => {
      let errorMessage = await args.onOkClick(newValue, state)
      if (errorMessage == null) {
        args.dispose()
      } else {
        setErrorMessage(errorMessage)
      }
    })
  }, [args])

  // This would've been way better as a form submission action, but that approach breaks the dialog layout
  let handleEnterPressed = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onOkClick()
    }
  }, [onOkClick])

  return (
    <AlertDialog open={!!args.state}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{args.config.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {errorMessage ? <p className="text-red-600">{errorMessage}</p> : ""}
            <p>{args.config.description}</p>
            {(() => {
              switch (args.config.inputType) {
                case "text":
                  return <Input ref={inputRef}
                                type="text"
                                placeholder={args.state ? args.stateToInitialValue(args.state) : ""}
                                defaultValue={args.state ? args.stateToInitialValue(args.state) : ""}
                                onKeyDown={handleEnterPressed}/>
                case "integer":
                  return <Input ref={inputRef}
                                type="number"
                                placeholder={args.state ? args.stateToInitialValue(args.state) : ""}
                                defaultValue={args.state ? args.stateToInitialValue(args.state) : ""}
                                onKeyDown={handleEnterPressed}/>
                default:
                  AssertUnreachable(args.config.inputType)
              }
            })()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => args.dispose()}>Cancel</AlertDialogCancel>
          <AlertDialogAction type="submit" onClick={onOkClick}>{args.config.okButtonLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
