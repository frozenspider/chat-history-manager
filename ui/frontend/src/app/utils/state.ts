'use client'

import React from "react";

import { Dataset, Message, User } from "@/protobuf/core/protobuf/entities";
import {
  ChatWithDetailsPB,
  HistoryDaoServiceClient,
  HistoryLoaderServiceClient
} from "@/protobuf/backend/protobuf/services";

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
// Globally accessible cache of chat view states
//

const ChatViewStateCache =
  new Map<FileKey, Map<UuidString, Map<bigint, ChatViewState>>>()

export async function GetCachedChatViewStateAsync(
  key: FileKey,
  uuid: UuidString,
  chatId: bigint,
  onMiss: () => Promise<ChatViewState>
): Promise<ChatViewState> {
  if (!ChatViewStateCache.has(key)) {
    ChatViewStateCache.set(key, new Map())
  }
  let fileMap = ChatViewStateCache.get(key)!
  if (!fileMap.has(uuid)) {
    fileMap.set(uuid, new Map())
  }
  let uuidMap = fileMap.get(uuid)!
  if (!uuidMap.has(chatId)) {
    uuidMap.set(chatId, await onMiss())
  }
  return uuidMap.get(chatId)!
}

export function ClearCachedChatViewState(
  key: FileKey,
  uuid: UuidString,
  chatId: bigint,
): void {
  if (!ChatViewStateCache.has(key)) {
    return
  }
  let fileMap = ChatViewStateCache.get(key)!
  if (!fileMap.has(uuid)) {
    return
  }
  let uuidMap = fileMap.get(uuid)!
  uuidMap.delete(chatId)
  if (uuidMap.size === 0) {
    fileMap.delete(uuid)
  }
  if (fileMap.size === 0) {
    ChatViewStateCache.delete(key)
  }
}

export interface ChatViewState {
  messages: Message[],
  beginReached: boolean,
  endReached: boolean
}

//
// Other kinds of state
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
  users: Map<bigint, User>,
  myselfId: bigint,
  cwds: ChatWithDetailsPB[]
}

export interface CurrentChatState {
  cwd: ChatWithDetailsPB,
  dsState: DatasetState
}
