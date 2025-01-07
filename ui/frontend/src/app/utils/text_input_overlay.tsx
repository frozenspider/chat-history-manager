import React from "react";
import { Assert } from "@/app/utils/utils";
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

type ErrorMessage = string

export function TextInputOverlay<S>(args: {
  title: string,
  description: string,
  state: S | null
  stateToInitialValue: (s: S) => string
  setState: (s: S | null) => void
  okButtonLabel: string
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
          <AlertDialogTitle>{args.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {errorMessage ? <p className="text-red-600">{errorMessage}</p> : ""}
            <p>{args.description}</p>
            <Input ref={inputRef}
                   type="text"
                   placeholder={args.state ? args.stateToInitialValue(args.state) : ""}
                   defaultValue={args.state ? args.stateToInitialValue(args.state) : ""}/>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => args.setState(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onOkClick}>{args.okButtonLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
