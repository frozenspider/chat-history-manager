import React from "react";

import {
  ChatAndMessage,
  ChatAndMessageAsc,
  ChatId,
  CombinedChat,
  FileKey,
  MessagesBatchSize,
  MsgSourceId,
  UuidString
} from "@/app/utils/entity_utils";
import { Chat, Message } from "@/protobuf/core/protobuf/entities";
import { DatasetState, ServicesContextType } from "@/app/utils/state";
import { Assert, CreateMapFromKeys, ForAll, GetOrInsertDefault, PromiseCatchReportError } from "@/app/utils/utils";

type ChatLoadStateLoaded = {
  $case: "loaded"

  lowestInternalId: bigint,
  highestInternalId: bigint,

  beginReached: boolean,
  endReached: boolean,
}

interface ChatLoadStateNotLoaded {
  $case: "not_loaded",
  beginReached: boolean,
  endReached: boolean,
}

interface ChatLoadStateNoMessages {
  $case: "no_messages",
  beginReached: true,
  endReached: true,
}

const ChatLoadStateNoMessages: ChatLoadStateNoMessages = {
  $case: "no_messages",
  beginReached: true,
  endReached: true,
}

type ChatLoadState = ChatLoadStateLoaded | ChatLoadStateNotLoaded | ChatLoadStateNoMessages

interface ChatViewState {
  /** Messages loaded from server */
  chatMessages: ChatAndMessage[],

  scrollTop: number,
  scrollHeight: number,

  /** Whether last time we loaded previous messages (user scrolled up) */
  lastScrollDirectionUp: boolean
}

/** State of a chat view, including necessary context, loaded messages and scroll state. */
export class ChatState {
  cc: CombinedChat
  dsState: DatasetState
  viewState: ChatViewState | null

  /**
   * Should ALWAYS contain an entry for each chat.
   */
  loadState: Map<ChatId, ChatLoadState>

  /**
   * Individual messages fetched to render replies, pinned messages, etc.
   * Used for eager render when restoring chat view.
   * Should ALWAYS contain an entry for each chat.
   */
  resolvedMessages: Map<ChatId, Map<MsgSourceId, Message>>

  constructor(
    cc: CombinedChat,
    dsState: DatasetState,
    viewState?: ChatViewState,
    loadState?: Map<ChatId, ChatLoadState>,
    resolvedMessages?: Map<ChatId, Map<MsgSourceId, Message>>
  ) {
    this.cc = cc
    this.dsState = dsState
    this.viewState = viewState ?? null

    let keys = cc.cwds.map(cwd => cwd.chat!.id)
    this.loadState = loadState ?? CreateMapFromKeys(keys, _ => ({
      $case: "not_loaded",
      beginReached: false,
      endReached: false
    }))
    this.resolvedMessages = resolvedMessages ?? CreateMapFromKeys(keys, _ => new Map())
  }

  /** Return a clean state of this chat */
  Reset(): ChatState {
    return new ChatState(this.cc, this.dsState)
  }

  /**
   * Attempts to (asynchronously) fetch more messages and return the new chat state.
   * Errors are reported and cause this to return null.
   *
   * Note: last messages are exteme case of loading previous messages, same with first and next
   */
  async FetchMore(
    fetchPrevious: boolean,
    isFetching: React.MutableRefObject<boolean>,
    services: ServicesContextType,
    scrollOwner: HTMLElement | null
  ): Promise<ChatState | null> {
    let viewState = this.viewState
    let loadStates = this.loadState

    function AmendWithChat(chat: Chat, msgs: Message[]): ChatAndMessage[] {
      return msgs.map(msg => [chat, msg] as const)
    }

    Assert(!isFetching.current, "Fetching is already in progress")
    isFetching.current = true

    let FetchMoreMessages = async (
      chat: Chat,
      prevLoadState: ChatLoadState
    ) => {
      if (fetchPrevious) {
        if (prevLoadState.beginReached) {
          return [] as Message[]
        }
        return (prevLoadState.$case == "loaded" ?
          await services.daoClient.messagesBefore({
            key: this.dsState.fileKey,
            chat: chat,
            messageInternalId: prevLoadState.lowestInternalId,
            limit: MessagesBatchSize
          }) :
          await services.daoClient.lastMessages({
            key: this.dsState.fileKey,
            chat: chat,
            limit: MessagesBatchSize
          })).messages
      } else {
        if (prevLoadState.endReached) {
          return [] as Message[]
        }
        return (prevLoadState.$case == "loaded" ?
          await services.daoClient.messagesAfter({
            key: this.dsState.fileKey,
            chat: chat,
            messageInternalId: prevLoadState.highestInternalId,
            limit: MessagesBatchSize
          }) :
          await services.daoClient.scrollMessages({
            key: this.dsState.fileKey,
            chat: chat,
            offset: BigInt(0),
            limit: MessagesBatchSize
          })).messages
      }
    }

    let newChatStatePromise: Promise<[ChatViewState, Map<ChatId, ChatLoadState>]> = (async () => {
        let allChatMessagesPromise =
          Promise.all(this.cc.cwds.map(async cwd => {
            let chat = cwd.chat!
            let loadState = loadStates.get(chat.id)!
            let msgs = await FetchMoreMessages(chat, loadState);
            return AmendWithChat(chat, msgs);
          }))
        let allChatMessages = (await allChatMessagesPromise).flat().sort(ChatAndMessageAsc)
        let chatMessages = (fetchPrevious ?
          allChatMessages.slice(-Number(MessagesBatchSize)) :
          allChatMessages.slice(0, Number(MessagesBatchSize)))

        function MakeNewLoadState(chat: Chat): ChatLoadState {
          let prevLoadState = loadStates.get(chat.id)!

          let sameChatCond = (cm: ChatAndMessage, _1: number, _2: ChatAndMessage[]) => cm[0].id == chat.id
          let loadingMore = prevLoadState.$case == "loaded"

          if (!allChatMessages.some(sameChatCond)) {
            if (!loadingMore) {
              // There were no messages fetched to begin with
              return ChatLoadStateNoMessages
            }

            // We've hit the limit, either at the beginning or at the end
            Assert(prevLoadState.$case == "loaded") // To keep typescript happy
            return {
              $case: "loaded",

              lowestInternalId: prevLoadState.lowestInternalId,
              highestInternalId: prevLoadState.highestInternalId,

              beginReached: fetchPrevious ? true : prevLoadState.beginReached,
              endReached: !fetchPrevious ? true : prevLoadState.endReached,
            }
          }

          let firstKeptInternalId = chatMessages.find(sameChatCond)?.[1]?.internalId
          let lastKeptInternalId = chatMessages.findLast(sameChatCond)?.[1].internalId

          if (firstKeptInternalId === undefined || lastKeptInternalId === undefined) {
            return {
              $case: "not_loaded",
              beginReached: !fetchPrevious ? true : prevLoadState.beginReached,
              endReached: fetchPrevious ? true : prevLoadState.endReached,
            }
          }

          // Suboptimal, but oh well
          let fetchedBeforeFiltering = allChatMessages.filter(sameChatCond).length
          let fetchedAfterFiltering = chatMessages.filter(sameChatCond).length
          let hitTheLimit = fetchedBeforeFiltering < Number(MessagesBatchSize) && fetchedAfterFiltering == fetchedBeforeFiltering
          if (fetchPrevious) {
            return {
              $case: "loaded",

              lowestInternalId: firstKeptInternalId,
              highestInternalId: prevLoadState.$case == "loaded" ? prevLoadState.highestInternalId : lastKeptInternalId,

              beginReached: hitTheLimit,
              endReached: loadingMore ? prevLoadState.endReached : true,
            }
          } else {
            return {
              $case: "loaded",

              lowestInternalId: prevLoadState.$case == "loaded" ? prevLoadState.lowestInternalId : firstKeptInternalId,
              highestInternalId: lastKeptInternalId,

              beginReached: loadingMore ? prevLoadState.beginReached : true,
              endReached: hitTheLimit,
            }
          }
        }

        let newLoadStates = new Map<ChatId, ChatLoadState>()
        for (let cwd of this.cc.cwds) {
          newLoadStates.set(cwd.chat!.id, MakeNewLoadState(cwd.chat!))
        }

        // If chat was entirely not loaded, we'll need to scroll to the absolute top/bottom
        let wasNotLoaded = ForAll(loadStates.values(), state => state.$case == "not_loaded")

        let prevScrollTop = scrollOwner?.scrollTop ?? viewState?.scrollTop
        let prevScrollHeight = scrollOwner?.scrollHeight ?? viewState?.scrollHeight

        let newViewState: ChatViewState = (fetchPrevious ?
            {
              chatMessages: [...chatMessages, ...(viewState?.chatMessages ?? [])],
              scrollTop: wasNotLoaded ? (Number.MAX_SAFE_INTEGER / 2) : prevScrollTop!,
              scrollHeight: wasNotLoaded ? 0 : prevScrollHeight!,
              lastScrollDirectionUp: !wasNotLoaded
            } : {
              chatMessages: [...(viewState?.chatMessages ?? []), ...chatMessages],
              scrollTop: wasNotLoaded ? 0 : prevScrollTop!,
              scrollHeight: wasNotLoaded ? (Number.MAX_SAFE_INTEGER / 2) : prevScrollHeight!,
              lastScrollDirectionUp: wasNotLoaded
            }
        )

        return [newViewState, newLoadStates]
      }
    )()

    return PromiseCatchReportError(newChatStatePromise
      .then(([newViewState, newLoadState]) =>
        new ChatState(this.cc, this.dsState, newViewState, newLoadState, this.resolvedMessages)
      ))
      .then(x => x ?? null)
      .finally(() => {
        isFetching.current = false
      })
  }
}

//
// Globally accessible cache of chat states
//

const ChatStateCache = new Map<FileKey, Map<UuidString, Map<ChatId, ChatState>>>()

/** Asynchronously get a chat view state from cache, or create it if it's not there using `onMiss()` */
export function GetCachedChatState(
  key: FileKey,
  uuid: UuidString,
  mainChatId: ChatId,
  getDefaultValue: () => ChatState
): ChatState {
  let fileMap =
    GetOrInsertDefault(ChatStateCache, key, () => new Map<UuidString, Map<ChatId, ChatState>>())
  let uuidMap =
    GetOrInsertDefault(fileMap, uuid, () => new Map<ChatId, ChatState>())
  return GetOrInsertDefault(uuidMap, mainChatId, getDefaultValue)
}

export function SetCachedChatState(
  value: ChatState
): void {
  let fileMap =
    GetOrInsertDefault(ChatStateCache, value.dsState.fileKey, () => new Map<UuidString, Map<ChatId, ChatState>>())
  let uuidMap =
    GetOrInsertDefault(fileMap, value.cc.dsUuid, () => new Map<ChatId, ChatState>())
  uuidMap.set(value.cc.mainChatId, value)
}

/** If values are omitted, clear all */
export function ClearCachedChatState(
  key: FileKey,
  uuid?: UuidString,
  mainChatId?: ChatId,
): void {
  if (!ChatStateCache.has(key)) {
    return
  }
  let fileMap = ChatStateCache.get(key)!
  if (uuid === undefined) {
    fileMap.clear()
    return
  }
  if (!fileMap.has(uuid)) {
    return
  }
  let uuidMap = fileMap.get(uuid)!
  if (mainChatId === undefined) {
    uuidMap.clear()
    return
  }
  uuidMap.delete(mainChatId)
  if (uuidMap.size === 0) {
    fileMap.delete(uuid)
  }
  if (fileMap.size === 0) {
    ChatStateCache.delete(key)
  }
}
