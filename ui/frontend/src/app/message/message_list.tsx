import React from "react";

import { InView } from "react-intersection-observer";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { Chat } from "@/protobuf/core/protobuf/entities";

import { MessageComponent } from "@/app/message/message";

import { Assert, AssertDefined, ForAll, GetNonDefaultOrNull } from "@/app/utils/utils";
import { NavigationCallbacks, ServicesContext, ServicesContextType } from "@/app/utils/state";
import { GetChatPrettyName } from "@/app/utils/entity_utils";
import { ChatState, SetCachedChatState } from "@/app/utils/chat_state";
import MessagesLoadSpinner from "@/app/utils/load_spinner";

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

  let scrollOwner = React.useRef<HTMLDivElement | null>(null)
  let isFetching = React.useRef(false)
  let infiniteScrollActive = React.useRef(false)

  // Save scroll position every time users scrolls
  // Note: directly mutating part of what might (still) be a state object!
  let onScroll = React.useCallback(() => {
    if (!scrollOwner.current || !chatState || !chatState.viewState) return
    chatState.viewState.scrollTop = scrollOwner.current.scrollTop
    chatState.viewState.scrollHeight = scrollOwner.current.scrollHeight
  }, [chatState])

  // Restore scroll position associated with the view state, happens when view state changes.
  // TODO: This doesn't always work because some elements (e.g. lazy messages) shift the scroll position.
  React.useEffect(() => {
    if (scrollOwner.current && chatState?.viewState) {
      console.log(GetLogPrefix(chatState?.cc.mainCwd.chat)
        + "Applying scroll", chatState.viewState.scrollTop +
        " (user scrolled " + (chatState.viewState.lastScrollDirectionUp ? "up" : "down") + ")")
      ApplyScroll(scrollOwner.current, chatState.viewState.scrollTop, chatState.viewState.scrollHeight,
        chatState.viewState.lastScrollDirectionUp)
      // Allow infinite scroll to trigger only after the initial scroll position is set
      infiniteScrollActive.current = true
    }
  }, [chatState?.cc.mainCwd.chat, chatState?.viewState, scrollOwner])

  // Set navigation callbacks and fetch initial data on first render
  React.useEffect(() => {
    let callbacks: NavigationCallbacks = {
      toBeginning() {
        if (!chatState) return

        TryFetchMoreMessages(
          false,
          isFetching,
          chatState.Reset(),
          setChatState,
          services,
          scrollOwner.current
        )
      },
      toEnd() {
        if (!chatState) return

        TryFetchMoreMessages(
          true,
          isFetching,
          chatState.Reset(),
          setChatState,
          services,
          scrollOwner.current
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

  }, [chatState, setChatState, setNavigationCallbacks, services, scrollOwner])

  // Trigger loading more messages when topmost/bottommost messages are in the view
  let onBorderlineMessagesView = React.useCallback((inView: boolean, previous: boolean) => {
    if (!inView || !infiniteScrollActive) return
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
      scrollOwner.current
    )
  }, [chatState, setChatState, services])

  if (!chatState)
    return <></>

  if (!chatState.viewState)
    return <MessagesLoadSpinner center={true} text="Fetching..."/>

  AssertDefined(chatState.cc.mainCwd.chat)

  let totalMessages = chatState.viewState.chatMessages.length
  return (
    <ScrollAreaPrimitive.Viewport ref={scrollOwner}
                                  className="h-full w-full rounded-[inherit]"
                                  onScroll={onScroll}>
      <div className="p-4 space-y-4">
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
                comp = <InView onChange={(inView, _) => onBorderlineMessagesView(inView, true)}>{comp}</InView>
              }
              if ((totalMessages - idx) <= ScrollTriggeringMessageNumber) {
                comp = <InView onChange={(inView, _) => onBorderlineMessagesView(inView, false)}>{comp}</InView>
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
    </ScrollAreaPrimitive.Viewport>
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
  if (isFetching.current) {
    // Fetch is already in progress
    return
  }

  isFetching.current = true
  console.log(GetLogPrefix(chatState?.cc.mainCwd.chat) + "Fetching more messages: " + (fetchPrevious ? "previous" : "next"))

  chatState.FetchMore(fetchPrevious, services, scrollOwner)
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
    .finally(() => {
      isFetching.current = false
    })
}
