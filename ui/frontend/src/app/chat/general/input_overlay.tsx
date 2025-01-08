import React from "react";
import { Assert, AssertUnreachable } from "@/app/utils/utils";
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
  setState: (s: S | null) => void
  onOkClick: (newValue: string, oldState: S) => ErrorMessage | null
}): React.JSX.Element {
  let [errorMessage, setErrorMessage] =
    React.useState<ErrorMessage | null>(null)

  let inputRef =
    React.useRef<HTMLInputElement>(null)

  let onOkClick = React.useCallback(() => {
    Assert(inputRef.current != null)
    Assert(args.state != null)
    let newValue = inputRef.current.value
    let errorMessage = args.onOkClick(newValue, args.state)
    if (errorMessage == null) {
      args.setState(null)
    } else {
      setErrorMessage(errorMessage)
    }
  }, [args])

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
                                defaultValue={args.state ? args.stateToInitialValue(args.state) : ""}/>
                case "integer":
                  return <Input ref={inputRef}
                                type="number"
                                placeholder={args.state ? args.stateToInitialValue(args.state) : ""}
                                defaultValue={args.state ? args.stateToInitialValue(args.state) : ""}/>
                default:
                  AssertUnreachable(args.config.inputType)
              }
            })()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => args.setState(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction type="submit" onClick={onOkClick}>{args.config.okButtonLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
