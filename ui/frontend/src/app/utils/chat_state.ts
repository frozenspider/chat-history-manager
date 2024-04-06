import React from "react";

import {
  ChatAndMessage,
  ChatId,
  CombinedChat,
  FileKey,
  MessagesBatchSize,
  MsgSourceId,
  UuidString
} from "@/app/utils/entity_utils";
import { Chat, Message } from "@/protobuf/core/protobuf/entities";
import { DatasetState, ServicesContextType } from "@/app/utils/state";
import {
  Assert,
  AssertDefined,
  AssertUnreachable,
  CreateMapFromKeys,
  GetOrInsertDefault,
  PromiseCatchReportError
} from "@/app/utils/utils";


export enum FetchType {
  Beginning, End, Previous, Next
}

type ChatLoadStateLoaded = {
  $case: "loaded"

  lowestInternalId: bigint,
  highestInternalId: bigint,

  beginReached: boolean,
  endReached: boolean,
}

interface ChatLoadStateNotLoaded {
  $case: "not_loaded",
  beginReached: false,
  endReached: false,
}

const ChatLoadStateNotLoaded: ChatLoadStateNotLoaded = {
  $case: "not_loaded",
  beginReached: false,
  endReached: false,
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
    this.loadState = loadState ?? CreateMapFromKeys(keys, _ => ChatLoadStateNotLoaded)
    this.resolvedMessages = resolvedMessages ?? CreateMapFromKeys(keys, _ => new Map())
  }

  /**
   * Attempts to (asynchronously) fetch more messages and return the new chat state.
   * Errors are reported and cause this to return null.
   */
  async FetchMore(
    fetchType: FetchType,
    isFetching: React.MutableRefObject<boolean>,
    services: ServicesContextType,
    scrollOwner: HTMLElement | null
  ): Promise<ChatState | null> {
    let viewState = this.viewState
    let loadStates = this.loadState

    function AmendWithChat(chat: Chat, msgs: Message[]): ChatAndMessage[] {
      return msgs.map(msg => [chat, msg] as const)
    }

    // FIXME: Merged chat support
    Assert(!isFetching.current, "Fetching is already in progress")
    isFetching.current = true
    let newChatPartialStatePromise: Promise<[ChatViewState, ChatLoadState]> = (async () => {
      switch (fetchType) {
        case FetchType.Beginning: {
          let chat = this.cc.mainCwd.chat!
          let response = await services.daoClient.scrollMessages({
            key: this.dsState.fileKey,
            chat: chat,
            offset: BigInt(0),
            limit: MessagesBatchSize
          })
          let hasMessages = response.messages.length > 0
          return [{
            chatMessages: AmendWithChat(chat, response.messages),
            scrollTop: 0,
            scrollHeight: Number.MAX_SAFE_INTEGER,
            lastScrollDirectionUp: true
          } as ChatViewState, hasMessages ? {
            $case: "loaded",

            lowestInternalId: response.messages[0].internalId,
            highestInternalId: response.messages[response.messages.length - 1].internalId,

            beginReached: true,
            endReached: response.messages.length < MessagesBatchSize,
          } : ChatLoadStateNoMessages]
        }
        case FetchType.End: {
          let chat = this.cc.mainCwd.chat!
          let response = await services.daoClient.lastMessages({
            key: this.dsState.fileKey,
            chat: this.cc.mainCwd.chat!,
            limit: MessagesBatchSize
          })
          let hasMessages = response.messages.length > 0
          return [{
            chatMessages: AmendWithChat(chat, response.messages),
            scrollTop: Number.MAX_SAFE_INTEGER,
            scrollHeight: 0,
            lastScrollDirectionUp: false
          } as ChatViewState, hasMessages ? {
            $case: "loaded",

            lowestInternalId: response.messages[0].internalId,
            highestInternalId: response.messages[response.messages.length - 1].internalId,

            beginReached: response.messages.length < MessagesBatchSize,
            endReached: true,
          } : ChatLoadStateNoMessages]
        }
        case FetchType.Previous: {
          Assert(viewState != null, "Chat view state was null")
          let chat = this.cc.mainCwd.chat!
          let loadState = loadStates.get(chat.id)!
          let firstMessage = viewState.chatMessages[0][1]
          AssertDefined(firstMessage.internalId, "firstMessage.internalId")
          let response = await services.daoClient.messagesBefore({
            key: this.dsState.fileKey,
            chat: this.cc.mainCwd.chat!,
            messageInternalId: firstMessage.internalId,
            limit: MessagesBatchSize
          })
          let hasMessages = response.messages.length > 0
          return [{
            ...viewState,
            chatMessages: [...AmendWithChat(chat, response.messages), ...viewState!.chatMessages],
            scrollTop: scrollOwner ? scrollOwner.scrollTop : viewState!.scrollTop,
            scrollHeight: scrollOwner ? scrollOwner.scrollHeight : viewState!.scrollHeight,
            lastScrollDirectionUp: true
          } as ChatViewState, hasMessages ? {
            $case: "loaded",

            lowestInternalId: response.messages[0].internalId,
            highestInternalId: loadState.$case == "loaded" ? loadState.highestInternalId : response.messages[response.messages.length - 1].internalId,

            beginReached: response.messages.length < MessagesBatchSize,
            endReached: loadState.endReached,
          } : ChatLoadStateNoMessages]
        }
        case FetchType.Next: {
          Assert(viewState != null, "Chat view state was null")
          let chat = this.cc.mainCwd.chat!
          let loadState = loadStates.get(chat.id)!
          let lastMessage = viewState.chatMessages[viewState.chatMessages.length - 1][1]
          AssertDefined(lastMessage.internalId, "lastMessage.internalId")
          let response = await services.daoClient.messagesAfter({
            key: this.dsState.fileKey,
            chat: this.cc.mainCwd.chat!,
            messageInternalId: lastMessage.internalId,
            limit: MessagesBatchSize
          })
          let hasMessages = response.messages.length > 0
          return [{
            ...viewState,
            chatMessages: [...viewState.chatMessages, ...AmendWithChat(chat, response.messages)],
            scrollTop: scrollOwner ? scrollOwner.scrollTop : viewState!.scrollTop,
            scrollHeight: scrollOwner ? scrollOwner.scrollHeight : viewState!.scrollHeight,
            lastScrollDirectionUp: false
          } as ChatViewState, hasMessages ? {
            $case: "loaded",

            lowestInternalId: loadState.$case == "loaded" ? loadState.lowestInternalId : response.messages[0].internalId,
            highestInternalId: response.messages[response.messages.length - 1].internalId,

            beginReached: loadState.beginReached,
            endReached: response.messages.length < MessagesBatchSize,
          } : ChatLoadStateNoMessages]
        }
        default:
          AssertUnreachable(fetchType)
      }
    })()

    return PromiseCatchReportError(newChatPartialStatePromise
      .then(([newViewState, newLoadState]) => {
        let newChatState: ChatState =
          new ChatState(this.cc, this.dsState, newViewState, this.loadState, this.resolvedMessages)
        newChatState.loadState.set(this.cc.mainCwd.chat!.id, newLoadState)
        return newChatState
      }))
      .then(x => x ?? null)
      .finally(() => {
        isFetching.current = false
      })
  }
}

//
// Globally accessible cache of chat states
//

const ChatStateCache =
  new Map<FileKey, Map<UuidString, Map<ChatId, ChatState>>>()

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
