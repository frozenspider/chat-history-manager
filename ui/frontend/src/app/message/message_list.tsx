import React from "react";

import { InView } from "react-intersection-observer";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { Chat } from "@/protobuf/core/protobuf/entities";

import { MessageComponent } from "@/app/message/message";

import {
  AppEvent,
  Assert,
  AssertDefined,
  EmitToSelf,
  ForAll,
  GetNonDefaultOrNull,
  PromiseCatchReportError
} from "@/app/utils/utils";
import { NavigationCallbacks, GrpcServices, GetServices } from "@/app/utils/state";
import { GetChatPrettyName } from "@/app/utils/entity_utils";
import { ChatState, ChatStateCache, ChatStateCacheContext } from "@/app/utils/chat_state";
import LoadSpinner from "@/app/general/load_spinner";


/**
 * How many messages (from both ends) will be observed so that new batch will be loaded as soon as they get into view
 */
const ScrollTriggeringMessageNumber = 15;

export const PreloadEverythingEvent = "preload-everything" as AppEvent

export default function MessagesList(args: {
  // We're unrolling arguments like this to make hook dependencies more granular
  chatState: ChatState | null,
  setChatState: (s: ChatState) => void,
  setNavigationCallbacks: (cbs: NavigationCallbacks) => void,
  /** Used for exporting chat to HTML, will cause the component to load ALL messages */
  preloadEverything: boolean
}): React.JSX.Element {
  let services = GetServices()
  let chatStateCache = React.useContext(ChatStateCacheContext)!

  let scrollOwner = React.useRef<HTMLDivElement | null>(null)
  let isFetching = React.useRef(false)
  let infiniteScrollActive = React.useRef(false)

  // Save scroll position every time users scrolls
  // Note: directly mutating part of what might (still) be a state object!
  let onScroll = React.useCallback(() => {
    if (!scrollOwner.current || !args.chatState || !args.chatState.viewState) return
    args.chatState.viewState.scrollTop = scrollOwner.current.scrollTop
    args.chatState.viewState.scrollHeight = scrollOwner.current.scrollHeight
  }, [args.chatState])

  // Restore scroll position associated with the view state, happens when view state changes.
  // TODO: This doesn't always work because some elements (e.g. lazy messages) shift the scroll position.
  React.useEffect(() => {
    if (scrollOwner.current && args.chatState?.viewState) {
      console.log(GetLogPrefix(args.chatState?.cc.mainCwd.chat)
        + "Applying scroll", args.chatState.viewState.scrollTop +
        " (user scrolled " + (args.chatState.viewState.lastScrollDirectionUp ? "up" : "down") + ")")
      ApplyScroll(scrollOwner.current, args.chatState.viewState.scrollTop, args.chatState.viewState.scrollHeight,
        args.chatState.viewState.lastScrollDirectionUp)
      // Allow infinite scroll to trigger only after the initial scroll position is set
      infiniteScrollActive.current = true
    }
  }, [args.chatState?.cc.mainCwd.chat, args.chatState?.viewState, scrollOwner])

  // Set navigation callbacks and fetch initial data on first render
  React.useEffect(() => {
    let callbacks: NavigationCallbacks = {
      toBeginning() {
        if (!args.chatState) return Promise.resolve()

        return TryFetchMoreMessages(
          false,
          isFetching,
          args.chatState.GetCleanCopy(),
          args.setChatState,
          chatStateCache,
          services,
          scrollOwner.current
        )
      },
      toEnd() {
        if (!args.chatState) return Promise.resolve()

        return TryFetchMoreMessages(
          true,
          isFetching,
          args.chatState.GetCleanCopy(),
          args.setChatState,
          chatStateCache,
          services,
          scrollOwner.current
        )
      }
    }
    args.setNavigationCallbacks(callbacks)

    if (args.chatState && !args.chatState.viewState) {

      if (!args.preloadEverything) {
        // First invocation, load initial messages
        console.log(GetLogPrefix(args.chatState.cc.mainCwd.chat) +
          "Cache miss, fetching messages from the server and updating")
        PromiseCatchReportError(callbacks.toEnd())
      } else {
        // Emulate user scrolling all the way to the top.
        //
        // We're dealing with chatState the tricky way to only call TRUE setChatState as the last action.
        // This is because state changes aren't accessible before the next render.
        let intermittentChatState = args.chatState;

        Assert(ForAll(intermittentChatState.loadState.values(), t => t.$case == "not_loaded"),
          "Chat state is not clean before preload")

        PromiseCatchReportError(async () => {
          while (!intermittentChatState.BeginReached()) {
            await TryFetchMoreMessages(
              true,
              isFetching,
              intermittentChatState,
              (s) => intermittentChatState = s,
              chatStateCache,
              services,
              scrollOwner.current
            )
          }

          args.setChatState(intermittentChatState)

          await EmitToSelf(PreloadEverythingEvent, { error: null })
        })
      }
    }

  }, [args.chatState, args.setChatState, args.setNavigationCallbacks, services, scrollOwner])

  // Trigger loading more messages when topmost/bottommost messages are in the view
  let onBorderlineMessagesView = React.useCallback((inView: boolean, previous: boolean) => {
    if (!inView || !infiniteScrollActive) return
    Assert(args.chatState != null, "Chat state was null")
    let viewState = args.chatState.viewState
    Assert(viewState != null, "Chat view state was null")
    if (!previous && args.chatState.EndReached()) return
    if (previous && args.chatState.BeginReached()) return

    PromiseCatchReportError(TryFetchMoreMessages(
      previous,
      isFetching,
      args.chatState,
      args.setChatState,
      chatStateCache,
      services,
      scrollOwner.current
    ))
  }, [args.chatState, args.setChatState, services])

  let chatState = args.chatState
  if (!chatState) {
    return <></>
  }

  if (!chatState.viewState)
    return <LoadSpinner center={true} text="Fetching..."/>

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
                <MessageComponent msg={msg} chat={chat} chatState={chatState!} replyDepth={0}/>,
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
async function TryFetchMoreMessages(
  fetchPrevious: boolean,
  isFetching: React.MutableRefObject<boolean>,
  chatState: ChatState,
  setChatState: (s: ChatState) => void,
  chatStateCache: ChatStateCache,
  services: GrpcServices,
  scrollOwner: HTMLElement | null,
) {
  if (isFetching.current) {
    // Fetch is already in progress
    return
  }

  isFetching.current = true
  console.log(GetLogPrefix(chatState?.cc.mainCwd.chat) + "Fetching more messages: " + (fetchPrevious ? "previous" : "next"))

  return chatState.FetchMore(fetchPrevious, services, scrollOwner)
    .then(newChatState => {
      if (newChatState != null) {
        console.log(GetLogPrefix(chatState?.cc.mainCwd.chat)
          + "View state:", newChatState.viewState)
        console.log(GetLogPrefix(chatState?.cc.mainCwd.chat)
          + "Load state:", newChatState.loadState)
        chatStateCache.Set(newChatState)
        setChatState(newChatState)
      }
    })
    .catch((e) => {
      EmitToSelf(PreloadEverythingEvent, { error: e })
      throw e
    })
    .finally(() => {
      isFetching.current = false
    })
}
