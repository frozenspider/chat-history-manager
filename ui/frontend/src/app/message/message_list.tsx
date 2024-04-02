'use client'

import React from "react";

import { AssertDefined, GetNonDefaultOrNull, WrapPromise } from "@/app/utils/utils";
import { MessageComponent } from "@/app/message/message";
import { ChatState, ServicesContext, SetCachedChatState } from "@/app/utils/state";
import { MessagesBatchSize } from "@/app/utils/entity_utils";

export default function MessagesList(args: {
  chatState: ChatState | null,
  setChatState: (s: ChatState) => void
}): React.JSX.Element {
  let chatState = args.chatState

  let services = React.useContext(ServicesContext)!

  let wrapperElRef = React.useRef<HTMLDivElement | null>(null)
  let prevChatState = React.useRef<ChatState | null>(null)

  // TODO: Should be implemented in a more generic way, as this relies on knowing ScrollArea's structure.
  let getScrollOwner = () => wrapperElRef.current?.parentElement?.parentElement

  // Save an old scroll position on each render.
  // (This itself should not trigger a React state change event)
  let scrollOwner = getScrollOwner()
  if (prevChatState.current?.viewState && scrollOwner) {
    console.log("Saving scroll")
    prevChatState.current.viewState.scrollTop = scrollOwner.scrollTop
  }

  // TODO: This doesn't always work because some elements (e.g. lazy messages) shift the scroll position.
  // Happens when view state changes, restore scroll position associated with the view state.
  React.useEffect(() => {
    let scrollOwner = getScrollOwner()
    if (scrollOwner && chatState?.viewState) {
      console.log("Applying scroll", chatState.viewState.scrollTop)
      ApplyScroll(scrollOwner, chatState.viewState.scrollTop)
    }
  }, [wrapperElRef, chatState?.viewState])

  prevChatState.current = GetNonDefaultOrNull(chatState)

  // Fetch initial data
  React.useEffect(() => {
    if (!chatState || chatState.viewState) {
      // Nothing to fetch / fetched already
      return
    }
    // First invocation, load initial messages
    console.log("Cache miss! Fetching messages from the server and updating")

    WrapPromise(services.daoClient.lastMessages({
      key: chatState.dsState.fileKey,
      chat: chatState.cwd.chat!,
      limit: MessagesBatchSize
    }).then((response) => {
      console.log("Updating chat view state with fetched messages")
      let newChatState = {
        ...chatState,
        viewState: {
          messages: response.messages,
          scrollTop: Number.MAX_SAFE_INTEGER,
          beginReached: false,
          endReached: true,
          resolvedMessages: new Map()
        }
      }
      SetCachedChatState(newChatState)
      args.setChatState(newChatState)
    }))
  }, [chatState, args, services])

  if (!chatState)
    return <></>

  if (!chatState.viewState)
    return <p>Fetching...</p>

  AssertDefined(chatState.cwd.chat)
  AssertDefined(chatState.dsState.ds.uuid)

  return (
    <div className="p-4 space-y-4"
         ref={wrapperElRef}>
      {
        chatState.viewState.messages.map((msg) =>
          <MessageComponent key={chatState.dsState.ds.uuid + "_" + chatState.cwd.chat!.id + "_" + msg.internalId}
                            msg={msg}
                            chatState={chatState}
                            replyDepth={0}/>
        )
      }
    </div>
  )
}

function ApplyScroll(scrollOwner: HTMLElement, scrollTop: number) {
  scrollOwner.scrollTo({ left: 0, top: scrollTop, behavior: "instant" })
}
