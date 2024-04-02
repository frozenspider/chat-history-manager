'use client'

import React from "react";

import { AssertDefined, GetNonDefaultOrNull } from "@/app/utils/utils";
import { MessageComponent } from "@/app/message/message";
import { ChatViewState, CurrentChatState } from "@/app/utils/state";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";

export default function MessagesList(args: {
  state: CurrentChatState | null,
  viewState: ChatViewState | null,
}): React.JSX.Element {
  let [state, viewState] = [args.state, args.viewState]

  let wrapperElRef = React.useRef<HTMLDivElement | null>(null)
  let prevCwd = React.useRef<ChatWithDetailsPB | null>(null)
  let prevViewState = React.useRef<ChatViewState | null>(null)

  // TODO: Should be implemented in a more generic way, as this relies on knowing ScrollArea's structure.
  let getScrollOwner = () => wrapperElRef.current?.parentElement?.parentElement

  // Save an old scroll position on each render.
  // (This itself should not trigger a React state change event)
  let scrollOwner = getScrollOwner()
  if (prevViewState.current && scrollOwner) {
    prevViewState.current.scrollTop = scrollOwner.scrollTop
  }

  // TODO: This doesn't always work because some elements (e.g. lazy messages) shift the scroll position.
  // Happens when view state changes, restore scroll position associated with the view state.
  React.useEffect(() => {
    let scrollOwner = getScrollOwner()
    if (scrollOwner && viewState) {
      RestoreScroll(scrollOwner, viewState.scrollTop)
    }
  }, [wrapperElRef, viewState])

  prevCwd.current = GetNonDefaultOrNull(state?.cwd)
  prevViewState.current = viewState

  if (!state || !viewState)
    return <></>

  AssertDefined(state.cwd.chat)
  AssertDefined(state.dsState.ds.uuid)

  return (
    <div className="p-4 space-y-4"
         ref={wrapperElRef}>
      {
        viewState.messages.map((msg) =>
          <MessageComponent key={state.dsState.ds.uuid + "_" + state.cwd.chat!.id + "_" + msg.internalId}
                            msg={msg}
                            state={state}
                            resolvedMessagesCache={viewState.resolvedMessages}
                            replyDepth={0}/>
        )
      }
    </div>
  )
}

function RestoreScroll(scrollOwner: HTMLElement, scrollTop: number) {
  scrollOwner.scrollTo({ left: 0, top: scrollTop, behavior: "instant" })
}

