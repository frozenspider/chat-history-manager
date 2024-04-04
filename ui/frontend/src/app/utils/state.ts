'use client'

import React from "react";

import { Chat, Dataset, Message, User } from "@/protobuf/core/protobuf/entities";
import {
  ChatWithDetailsPB,
  HistoryDaoServiceClient,
  HistoryLoaderServiceClient
} from "@/protobuf/backend/protobuf/services";
import { GetOrInsertDefault } from "@/app/utils/utils";
import { ChatAndMessage, ChatId, CombinedChat, FileKey, MsgSourceId, UuidString } from "@/app/utils/entity_utils";

//
// gRPC service clients context
//

export const ServicesContext =
  React.createContext<ServicesContextType | null>(null)

export interface ServicesContextType {
  loadClient: HistoryLoaderServiceClient
  daoClient: HistoryDaoServiceClient
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

//
// Different kinds of state
//

export interface LoadedFileState {
  key: FileKey
  name: string
  datasets: DatasetState[]
}

export interface DatasetState {
  // To identify our dataset to the backend, we need (fileKey, dsUuid) pair.
  fileKey: FileKey
  ds: Dataset,
  dsRoot: string,
  users: Map<bigint, User>,
  myselfId: bigint,
  cwds: ChatWithDetailsPB[]
}

export interface ChatViewState {
  /** Messages loaded from server */
  chatMessages: ChatAndMessage[],
  beginReached: boolean,
  endReached: boolean,

  scrollTop: number,
  scrollHeight: number,

  /** Whether last time we loaded previous messages (user scrolled up) */
  lastScrollDirectionUp: boolean
}

/** State of a chat view, including necessary context, loaded messages and scroll state. */
export interface ChatState {
  cc: CombinedChat,
  dsState: DatasetState,
  viewState: ChatViewState | null,

  /**
   * Individual messages fetched to render replies, pinned messages, etc.
   * Used for eager render when restoring chat view.
   */
  resolvedMessages: Map<ChatId, Map<MsgSourceId, Message>>
}

/** Navigation callbacks, used to navigate to different time points in chat history */
export interface NavigationCallbacks {
  toBeginning(): void,

  toEnd(): void,

  // toDate(date: Date): void,
}
