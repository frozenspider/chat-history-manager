import React from "react";

import { User } from "@/protobuf/core/protobuf/entities";
import { AssertUnreachable, PromiseCatchReportError } from "@/app/utils/utils";
import { GetUserPrettyName } from "@/app/utils/entity_utils";

import {
  Dialog,
  DialogContent,
  DialogDescription, DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { emit } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


export type UserInputRequestState = {
  $case: "choose_myself",
  users: Array<User>,
} | {
  $case: "ask_for_text"
  prompt: string
}

export default function UserInputRequsterComponent(args: {
  state: UserInputRequestState | null,
  setState: (s: UserInputRequestState | null) => void
}) {
  let onUserSelected = React.useCallback((myselfIdx: number) => {
    PromiseCatchReportError(emit("choose-myself-response", myselfIdx))
    args.setState(null)
  }, [args])

  let onTextSubmited = React.useCallback((input: string) => {
    PromiseCatchReportError(emit("ask-for-text-response", input))
    args.setState(null)
  }, [args])

  let state = args.state

  return (
    <Dialog open={!!state} modal={true}>
      <DialogContent>{
        (() => {
          switch (state?.$case) {
            case null:
            case undefined:
              return null
            case "choose_myself":
              return <ChooseMyselfDialog users={state.users} onUserSelected={onUserSelected}/>
            case "ask_for_text":
              return <AskForTextDialog prompt={state.prompt} onSubmit={onTextSubmited}/>
            default:
              AssertUnreachable(state)
          }
        })()
      }</DialogContent>
    </Dialog>
  )
}

function ChooseMyselfDialog(args: {
  users: Array<User>,
  onUserSelected: (myselfIdx: number) => void
}) {
  return <>
    <DialogHeader>
      <DialogTitle>Choose yourself</DialogTitle>
      <DialogDescription>
        Which one of them is you?
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      {args.users.map(u =>
        <Button key={u.id}
                onClick={() => args.onUserSelected(args.users.indexOf(u))}>{
          GetUserPrettyName(u)
        }</Button>)
      }
    </DialogFooter>
  </>
}

function AskForTextDialog(args: {
  prompt: string,
  onSubmit: (input: string) => void
}) {
  let inputRef = React.useRef<HTMLInputElement>(null)

  return <>
    <DialogHeader>
      <DialogTitle>Input needed</DialogTitle>
      <DialogDescription>{
        args.prompt
          .split("\n")
          .map((line, idx) =>
            <p key={idx}>{line.trim()}</p>
          )
      }</DialogDescription>
    </DialogHeader>
    <Input ref={inputRef} type="text"/>
    <DialogFooter>
      <Button type="submit"
              variant="default"
              onClick={() => args.onSubmit(inputRef.current!.value)}>
        Submit
      </Button>
    </DialogFooter>
  </>
}

