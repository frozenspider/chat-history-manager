'use client'

import React from "react";

import { Dataset, User } from "@/protobuf/core/protobuf/entities";
import {
  ChatWithDetailsPB,
  HistoryDaoServiceClient,
  HistoryLoaderServiceClient
} from "@/protobuf/backend/protobuf/services";
import { EventName } from "@tauri-apps/api/event";
import { FileKey } from "@/app/utils/entity_utils";


/** An event popup sends to itself after it's ready, intended to be caught by the creator. */
export const PopupReadyEventName: EventName = "ready"

/** An event to set a state after popup is loaded */
export const SetPopupStateEventName: EventName = "set-state"
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

/** Navigation callbacks, used to navigate to different time points in chat history */
export interface NavigationCallbacks {
  toBeginning(): void,

  toEnd(): void,

  // toDate(date: Date): void,
}
