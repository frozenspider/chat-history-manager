import React from "react";

import { InView } from "react-intersection-observer";

import { Chat } from "@/protobuf/core/protobuf/entities";

import { MessageComponent } from "@/app/message/message";

import { Assert, AssertDefined, ForAll, GetNonDefaultOrNull } from "@/app/utils/utils";
import { NavigationCallbacks, ServicesContext, ServicesContextType } from "@/app/utils/state";
import { GetChatPrettyName } from "@/app/utils/entity_utils";
import { ChatState, SetCachedChatState } from "@/app/utils/chat_state";

/**
 * How many messages (from both ends) will be observed so that new batch will be loaded as soon as they get into view
 */
const ScrollTriggeringMessageNumber = 15;

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
      console.log(GetLogPrefix(chatState?.cc.mainCwd.chat)
        + "Applying scroll", chatState.viewState.scrollTop +
        " (user scrolled " + (chatState.viewState.lastScrollDirectionUp ? "up" : "down") + ")")
      ApplyScroll(scrollOwner, chatState.viewState.scrollTop, chatState.viewState.scrollHeight,
        chatState.viewState.lastScrollDirectionUp)
      // Allow infinite scroll to trigger only after the initial scroll position is set
      infiniteScrollActive.current = true
    }
  }, [wrapperElRef, chatState?.cc.mainCwd.chat, chatState?.viewState, getScrollOwner])

  // Set navigation callbacks and fetch initial data on first render
  React.useEffect(() => {
    let callbacks: NavigationCallbacks = {
      toBeginning() {
        // Nothing to fetch / fetch in progress
        if (!chatState || isFetching.current)
          return

        TryFetchMoreMessages(
          false,
          isFetching,
          chatState.Reset(),
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
          true,
          isFetching,
          chatState.Reset(),
          setChatState,
          services,
          getScrollOwner()
        )
      }
    }
    setNavigationCallbacks(callbacks)

    if (chatState && !chatState.viewState) {
      // First invocation, load initial messages
      console.log(GetLogPrefix(chatState.cc.mainCwd.chat) +
        "Cache miss, fetching messages from the server and updating")
      callbacks.toEnd()
    }

  }, [chatState, setChatState, setNavigationCallbacks, services, getScrollOwner])

  if (!chatState)
    return <></>

  if (!chatState.viewState)
    return <p>Fetching...</p>

  AssertDefined(chatState.cc.mainCwd.chat)

  function onSideMessagesView(inView: boolean, previous: boolean) {
    if (!inView || !infiniteScrollActive || isFetching.current) return
    Assert(chatState != null, "Chat state was null")
    let viewState = chatState.viewState
    Assert(viewState != null, "Chat view state was null")
    let loadState = chatState.loadState
    if (!previous && ForAll(loadState.values(), state => state.endReached)) return
    if (previous && ForAll(loadState.values(), state => state.beginReached)) return

    TryFetchMoreMessages(
      previous,
      isFetching,
      chatState,
      setChatState,
      services,
      getScrollOwner()
    )
  }

  let totalMessages = chatState.viewState.chatMessages.length
  return (
    <div className="p-4 space-y-4"
         ref={wrapperElRef}>
      {
        chatState.viewState.chatMessages
          .map(([chat, msg]) => {
            AssertDefined(chat, "Chat with ID " + chat.id + " was not found in the combined chat")
            return [ // eslint-disable-next-line react/jsx-key
              <MessageComponent msg={msg} chat={chat} chatState={chatState} replyDepth={0}/>,
              msg.internalId
            ] as const
          })
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
            <React.Fragment key={chatState.cc.dsUuid + "_" + chatState.cc.mainCwd.chat!.id + "_" + internalId}>
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

/**
 * Attempts to (asynchronously) fetch more messages and updates the chat state (both current and cached),
 * displaying an error popup on failure.
 * This will trigger component re-render.
 */
function TryFetchMoreMessages(
  fetchPrevious: boolean,
  isFetching: React.MutableRefObject<boolean>,
  chatState: ChatState,
  setChatState: (s: ChatState) => void,
  services: ServicesContextType,
  scrollOwner: HTMLElement | null
) {
  if (!isFetching.current) {
    console.log(GetLogPrefix(chatState?.cc.mainCwd.chat) + "Fetching more messages: " + (fetchPrevious ? "previous" : "next"))
  }
  chatState.FetchMore(fetchPrevious, isFetching, services, scrollOwner)
    .then(newChatState => {
      if (newChatState != null) {
        console.log(GetLogPrefix(chatState?.cc.mainCwd.chat)
          + "View state:", newChatState.viewState)
        console.log(GetLogPrefix(chatState?.cc.mainCwd.chat)
          + "Load state:", newChatState.loadState)
        SetCachedChatState(newChatState)
        setChatState(newChatState)
      }
    })
}
