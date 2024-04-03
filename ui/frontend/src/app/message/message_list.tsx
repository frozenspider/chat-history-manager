import React from "react";

import {
  Assert,
  AssertDefined,
  AssertUnreachable,
  GetNonDefaultOrNull,
  PromiseCatchReportError
} from "@/app/utils/utils";
import { MessageComponent } from "@/app/message/message";
import {
  ChatState,
  ChatViewState,
  NavigationCallbacks,
  ServicesContext,
  ServicesContextType,
  SetCachedChatState
} from "@/app/utils/state";
import { GetChatPrettyName, MessagesBatchSize } from "@/app/utils/entity_utils";
import { InView } from "react-intersection-observer";
import { Chat } from "@/protobuf/core/protobuf/entities";

/**
 * How many messages (from both ends) will be observed so that new batch will be loaded as soon as they get into view
 */
const ScrollTriggeringMessageNumber = 5;

export default function MessagesList({ chatState, setChatState, setNavigationCallbacks }: {
  // We're unrolling arguments like this to make hook dependencies more granular
  chatState: ChatState | null,
  setChatState: (s: ChatState) => void,
  setNavigationCallbacks: (cbs: NavigationCallbacks) => void
}): React.JSX.Element {
  let services = React.useContext(ServicesContext)!

  let wrapperElRef = React.useRef<HTMLDivElement | null>(null)
  let isFetching = React.useRef(false)
  let infiniteScrollActive = React.useRef(false)

  // TODO: Should be implemented in a more generic way, as this relies on knowing ScrollArea's structure.
  let getScrollOwner = React.useCallback(() =>
    GetNonDefaultOrNull(wrapperElRef.current?.parentElement?.parentElement), [wrapperElRef])

  // Save scroll position every time users scrolls
  React.useEffect(() => {
    let scrollOwner = getScrollOwner()
    if (!scrollOwner || !chatState) return
    let viewState = chatState.viewState
    if (!viewState) return

    let onScroll = () => {
      // Note: directly mutating part of what might (still) be a state object!
      viewState.scrollTop = scrollOwner.scrollTop
      viewState.scrollHeight = scrollOwner.scrollHeight
    }

    scrollOwner.addEventListener('scroll', onScroll)
    return () => scrollOwner?.removeEventListener('scroll', onScroll)
  }, [chatState, getScrollOwner])

  // Restore scroll position associated with the view state, happens when view state changes.
  // TODO: This doesn't always work because some elements (e.g. lazy messages) shift the scroll position.
  React.useEffect(() => {
    let scrollOwner = getScrollOwner()
    if (scrollOwner && chatState?.viewState) {
      console.log(GetLogPrefix(chatState?.cwd.chat)
        + "Applying scroll", chatState.viewState.scrollTop +
        " (" + (chatState.viewState.lastScrollDirectionUp ? "up" : "down") + ")")
      ApplyScroll(scrollOwner, chatState.viewState.scrollTop, chatState.viewState.scrollHeight,
        chatState.viewState.lastScrollDirectionUp)
      // Allow infinite scroll to trigger only after the initial scroll position is set
      infiniteScrollActive.current = true
    }
  }, [wrapperElRef, chatState?.cwd.chat, chatState?.viewState, getScrollOwner])

  // Set navigation callbacks and fetch initial data on first render
  React.useEffect(() => {
    let callbacks: NavigationCallbacks = {
      toBeginning() {
        // Nothing to fetch / fetch in progress
        if (!chatState || isFetching.current)
          return

        TryFetchMoreMessages(
          FetchType.Beginning,
          isFetching,
          chatState,
          setChatState,
          services,
          getScrollOwner()
        )
      },
      toEnd() {
        // Nothing to fetch / fetch in progress
        if (!chatState || isFetching.current)
          return

        TryFetchMoreMessages(
          FetchType.End,
          isFetching,
          chatState,
          setChatState,
          services,
          getScrollOwner()
        )
      }
    }
    setNavigationCallbacks(callbacks)

    if (chatState && !chatState.viewState) {
      // First invocation, load initial messages
      console.log(GetLogPrefix(chatState.cwd.chat) +
        "Cache miss, fetching messages from the server and updating")
      callbacks.toEnd()
    }

  }, [chatState, setChatState, setNavigationCallbacks, services, getScrollOwner])

  if (!chatState)
    return <></>

  if (!chatState.viewState)
    return <p>Fetching...</p>

  AssertDefined(chatState.cwd.chat)
  AssertDefined(chatState.dsState.ds.uuid)

  function onSideMessagesView(inView: boolean, isTop: boolean) {
    if (!inView || !infiniteScrollActive || isFetching.current) return
    Assert(chatState != null, "Chat state was null")
    let viewState = chatState.viewState
    Assert(viewState != null, "Chat view state was null")
    if (!isTop && viewState.endReached) return
    if (isTop && viewState.beginReached) return

    TryFetchMoreMessages(
      isTop ? FetchType.Previous : FetchType.Next,
      isFetching,
      chatState,
      setChatState,
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

function GetLogPrefix(chat: Chat | null | undefined) {
  return "Chat '" + GetChatPrettyName(GetNonDefaultOrNull(chat)) + "': "
}

function ApplyScroll(scrollOwner: HTMLElement, scrollTop: number, scrollHeight: number, scrollingUp: boolean) {
  // Scroll position is anchored to the top.
  // Because of that, prepending messages above the current scroll position (i.e. triggered by user scrolling up)
  // will cause the scroll to jump.
  // To prevent that, we offset current scroll by container height difference caused by new messages prepended.
  let scrollHeightDiff = scrollOwner.scrollHeight - scrollHeight
  let newScrollTop = scrollTop + (scrollingUp ? scrollHeightDiff : 0)
  scrollOwner.scrollTo({ left: 0, top: newScrollTop, behavior: "instant" })
}

enum FetchType {
  Beginning, End, Previous, Next
}

/**
 * Attempts to (asynchronously) fetch more messages and updates the chat state (both current and cached),
 * displaying an error popup on failure.
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
  console.log(GetLogPrefix(chatState?.cwd.chat) + "Fetching more messages: " + FetchType[fetchType])
  let newChatViewStatePromise: Promise<ChatViewState>
  switch (fetchType) {
    case FetchType.Beginning:
      newChatViewStatePromise = services.daoClient.scrollMessages({
        key: chatState.dsState.fileKey,
        chat: chatState.cwd.chat!,
        offset: BigInt(0),
        limit: MessagesBatchSize
      }).then(response => ({
        messages: response.messages,
        beginReached: true,
        endReached: response.messages.length < MessagesBatchSize,
        scrollTop: 0,
        scrollHeight: Number.MAX_SAFE_INTEGER,
        lastScrollDirectionUp: true
      }))
      break
    case FetchType.End:
      newChatViewStatePromise = services.daoClient.lastMessages({
        key: chatState.dsState.fileKey,
        chat: chatState.cwd.chat!,
        limit: MessagesBatchSize
      }).then(response => ({
        messages: response.messages,
        beginReached: response.messages.length < MessagesBatchSize,
        endReached: true,
        scrollTop: Number.MAX_SAFE_INTEGER,
        scrollHeight: 0,
        lastScrollDirectionUp: false
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
        scrollHeight: scrollOwner ? scrollOwner.scrollHeight : viewState!.scrollHeight,
        lastScrollDirectionUp: true
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
        scrollHeight: scrollOwner ? scrollOwner.scrollHeight : viewState!.scrollHeight,
        lastScrollDirectionUp: false
      }))
      break
    default:
      AssertUnreachable(fetchType)
  }

  PromiseCatchReportError(newChatViewStatePromise
    .then((newViewState) => {
      console.log(GetLogPrefix(chatState?.cwd.chat)
        + "Fetched " + newViewState.messages.length + " messages. Updating chat view state.")
      console.log(GetLogPrefix(chatState?.cwd.chat)
        + "Scroll owner:", scrollOwner)
      console.log(GetLogPrefix(chatState?.cwd.chat)
        + "View state:", newViewState)
      let newChatState: ChatState = {
        ...chatState,
        viewState: newViewState,
      }
      SetCachedChatState(newChatState)
      setChatState(newChatState)
    }))
    .finally(() => {
      isFetching.current = false
    })
}
