'use client'

import React from "react";

import { Dataset, Message, User } from "@/protobuf/core/protobuf/entities";
import {
  ChatWithDetailsPB,
  HistoryDaoServiceClient,
  HistoryLoaderServiceClient
} from "@/protobuf/backend/protobuf/services";
import { AssertDefined } from "@/app/utils/utils";

//
// Misc
//

export type FileKey = string
export type UuidString = string

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
  new Map<FileKey, Map<UuidString, Map<bigint, ChatState>>>()

/** Asynchronously get a chat view state from cache, or create it if it's not there using `onMiss()` */
export function GetCachedChatState(
  key: FileKey,
  uuid: UuidString,
  chatId: bigint,
  getDefaultValue: () => ChatState
): ChatState {
  if (!ChatStateCache.has(key)) {
    ChatStateCache.set(key, new Map())
  }
  let fileMap = ChatStateCache.get(key)!
  if (!fileMap.has(uuid)) {
    fileMap.set(uuid, new Map())
  }
  let uuidMap = fileMap.get(uuid)!
  if (!uuidMap.has(chatId)) {
    uuidMap.set(chatId, getDefaultValue())
  }
  return uuidMap.get(chatId)!
}

export function SetCachedChatState(
  value: ChatState
): void {
  AssertDefined(value.dsState.ds.uuid)
  AssertDefined(value.cwd.chat)
  if (!ChatStateCache.has(value.dsState.fileKey)) {
    ChatStateCache.set(value.dsState.fileKey, new Map())
  }
  let fileMap = ChatStateCache.get(value.dsState.fileKey)!
  if (!fileMap.has(value.dsState.ds.uuid.value)) {
    fileMap.set(value.dsState.ds.uuid.value, new Map())
  }
  fileMap
    .get(value.dsState.ds.uuid.value)!
    .set(value.cwd.chat.id, value)
}

/** If values are omitted, clear all */
export function ClearCachedChatState(
  key: FileKey,
  uuid?: UuidString,
  chatId?: bigint,
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
  if (chatId === undefined) {
    uuidMap.clear()
    return
  }
  uuidMap.delete(chatId)
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
  messages: Message[],
  scrollTop: number,
  beginReached: boolean,
  endReached: boolean,
}

export interface ChatState {
  cwd: ChatWithDetailsPB,
  dsState: DatasetState,
  viewState: ChatViewState | null,

  /**
   * Individual messages fetched to render replies, pinned messages, etc.
   * Used for eager render when restoring chat view.
   */
  resolvedMessages: Map<bigint, Message>
}
