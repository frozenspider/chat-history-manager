'use client'

import React from "react";

import {
  Assert,
  AssertDefined,
  AssertUnreachable,
  GetNonDefaultOrNull,
  PromiseCatchReportError
} from "@/app/utils/utils";
import { MessageComponent } from "@/app/message/message";
import { ChatState, ChatViewState, ServicesContext, ServicesContextType, SetCachedChatState } from "@/app/utils/state";
import { MessagesBatchSize } from "@/app/utils/entity_utils";
import { InView } from "react-intersection-observer";

/**
 * How many messages (from both ends) will be observed so that new batch will be loaded as soon as they get into view
 */
const ScrollTriggeringMessageNumber = 5;

export default function MessagesList(args: {
  chatState: ChatState | null,
  setChatState: (s: ChatState) => void
}): React.JSX.Element {
  let chatState = args.chatState

  let services = React.useContext(ServicesContext)!

  let wrapperElRef = React.useRef<HTMLDivElement | null>(null)
  let prevChatState = React.useRef<ChatState | null>(null)
  let isFetchingPrev = React.useRef(false)
  let isFetchingNext = React.useRef(false)
  let infiniteScrollActive = React.useRef(false)

  // TODO: Should be implemented in a more generic way, as this relies on knowing ScrollArea's structure.
  let getScrollOwner = () => GetNonDefaultOrNull(wrapperElRef.current?.parentElement?.parentElement)

  // Save an old scroll position on each render.
  // (This itself should not trigger a React state change event)
  if (prevChatState.current?.viewState && getScrollOwner()) {
    let scrollOwner = getScrollOwner()!
    console.log("Saving scroll " + [scrollOwner.scrollTop, scrollOwner.scrollHeight])
    prevChatState.current.viewState.scrollTop = scrollOwner.scrollTop
    prevChatState.current.viewState.scrollHeight = scrollOwner.scrollHeight
  }

  // TODO: This doesn't always work because some elements (e.g. lazy messages) shift the scroll position.
  // Happens when view state changes, restore scroll position associated with the view state.
  React.useEffect(() => {
    let scrollOwner = getScrollOwner()
    if (scrollOwner && chatState?.viewState) {
      console.log("Applying scroll", chatState.viewState.scrollTop)
      ApplyScroll(scrollOwner, chatState.viewState.scrollTop, chatState.viewState.scrollHeight)
      // Allow infinite scroll to trigger only after the initial scroll position is set
      infiniteScrollActive.current = true
    }
  }, [wrapperElRef, chatState?.cwd.chat?.id, chatState?.viewState])

  prevChatState.current = GetNonDefaultOrNull(chatState)

  // Fetch initial data
  React.useEffect(() => {
    let isFetching = isFetchingNext // Doesn't matter which one is used
    // Nothing to fetch / fetched already / fetch in progress
    if (!chatState || chatState.viewState || isFetching.current)
      return
    // First invocation, load initial messages
    console.log("Cache miss! Fetching messages from the server and updating")

    TryFetchMoreMessages(
      FetchType.Initial,
      isFetching,
      chatState,
      args.setChatState,
      services,
      getScrollOwner()
    )
  }, [chatState, args, services])

  if (!chatState)
    return <></>

  if (!chatState.viewState)
    return <p>Fetching...</p>

  AssertDefined(chatState.cwd.chat)
  AssertDefined(chatState.dsState.ds.uuid)

  let onSideMessagesView = (inView: boolean, isTop: boolean) => {
    if (!inView || !infiniteScrollActive) return
    Assert(chatState != null, "Chat state was null")
    let viewState = chatState.viewState
    Assert(viewState != null, "Chat view state was null")
    if (!isTop && (viewState.endReached || isFetchingNext.current)) return
    if (isTop && (viewState.beginReached || isFetchingPrev.current)) return

    TryFetchMoreMessages(
      isTop ? FetchType.Previous : FetchType.Next,
      isTop ? isFetchingPrev : isFetchingNext,
      chatState,
      args.setChatState,
      services,
      getScrollOwner()
    )
  }

  let totalMessages = chatState.viewState.messages.length
  return (
    <div className="p-4 space-y-4"
         ref={wrapperElRef}>
      {
        chatState.viewState.messages
          .map(msg =>
            [ // eslint-disable-next-line react/jsx-key
              <MessageComponent msg={msg} chatState={chatState} replyDepth={0}/>,
              msg.internalId
            ] as const)
          .map(([msgComp, internalId], idx) => {
            // Wrapping border messages inside InView that will trigger fetching more messages.
            let comp = msgComp
            if (idx <= ScrollTriggeringMessageNumber) {
              comp = <InView onChange={(inView, _) => onSideMessagesView(inView, true)}>{comp}</InView>
            }
            if ((totalMessages - idx) <= ScrollTriggeringMessageNumber) {
              comp = <InView onChange={(inView, _) => onSideMessagesView(inView, false)}>{comp}</InView>
            }
            return [comp, internalId] as const
          })
          .map(([msgComp, internalId]) =>
            <React.Fragment key={chatState.dsState.ds.uuid!.value + "_" + chatState.cwd.chat!.id + "_" + internalId}>
              {msgComp}
            </React.Fragment>
          )
      }
    </div>
  )
}

enum FetchType {
  Initial, Previous, Next
}

function ApplyScroll(scrollOwner: HTMLElement, scrollTop: number, scrollHeight: number) {
  let scrollHeightDiff = scrollOwner.scrollHeight - scrollHeight
  let newScrollTop = scrollTop + scrollHeightDiff
  scrollOwner.scrollTo({ left: 0, top: newScrollTop, behavior: "instant" })
}

/**
 * Attempts to (asynchronously) fetch more messages and updates the chat state (both current and cached).
 * This will trigger component re-render.
 */
function TryFetchMoreMessages(
  fetchType: FetchType,
  isFetching: React.MutableRefObject<boolean>,
  chatState: ChatState,
  setChatState: (s: ChatState) => void,
  services: ServicesContextType,
  scrollOwner: HTMLElement | null
) {
  let viewState = chatState.viewState

  Assert(!isFetching.current, "Fetching is already in progress")
  isFetching.current = true
  console.log("Fetching more messages: " + FetchType[fetchType])
  let newChatViewStatePromise: Promise<ChatViewState>
  switch (fetchType) {
    case FetchType.Initial:
      newChatViewStatePromise = services.daoClient.lastMessages({
        key: chatState.dsState.fileKey,
        chat: chatState.cwd.chat!,
        limit: MessagesBatchSize
      }).then(response => ({
        messages: response.messages,
        beginReached: response.messages.length < MessagesBatchSize,
        endReached: true,
        scrollTop: Number.MAX_SAFE_INTEGER,
        scrollHeight: 0
      }))
      break
    case FetchType.Previous:
      Assert(viewState != null, "Chat view state was null")
      let firstMessage = viewState.messages[0]
      AssertDefined(firstMessage.internalId, "firstMessage.internalId")
      newChatViewStatePromise = services.daoClient.messagesBefore({
        key: chatState.dsState.fileKey,
        chat: chatState.cwd.chat!,
        messageInternalId: firstMessage.internalId,
        limit: MessagesBatchSize
      }).then(response => ({
        ...viewState,
        messages: [...response.messages, ...viewState!.messages],
        beginReached: response.messages.length < MessagesBatchSize,
        scrollTop: scrollOwner ? scrollOwner.scrollTop : viewState!.scrollTop,
        scrollHeight: scrollOwner ? scrollOwner.scrollHeight : viewState!.scrollHeight
      }))
      break
    case FetchType.Next:
      Assert(viewState != null, "Chat view state was null")
      let lastMessage = viewState.messages[viewState.messages.length - 1]
      AssertDefined(lastMessage.internalId, "lastMessage.internalId")
      newChatViewStatePromise = services.daoClient.messagesAfter({
        key: chatState.dsState.fileKey,
        chat: chatState.cwd.chat!,
        messageInternalId: lastMessage.internalId,
        limit: MessagesBatchSize
      }).then(response => ({
        ...viewState,
        messages: [...viewState!.messages, ...response.messages],
        endReached: response.messages.length < MessagesBatchSize,
        scrollTop: scrollOwner ? scrollOwner.scrollTop : viewState!.scrollTop,
        scrollHeight: scrollOwner ? scrollOwner.scrollHeight : viewState!.scrollHeight
      }))
      break
    default:
      AssertUnreachable(fetchType)
  }

  PromiseCatchReportError(newChatViewStatePromise
    .then((newViewState) => {
      console.log("Fetched " + newViewState.messages.length + " messages. Updating chat view state.")
      console.log("Scroll owner:", scrollOwner)
      console.log("View state:", newViewState)
      let newChatState = { ...chatState, viewState: newViewState }
      SetCachedChatState(newChatState)
      setChatState(newChatState)
    }))
    .finally(() => {
      isFetching.current = false
    })
}
