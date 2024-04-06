'use client'

import React from "react";

import { Dataset, User } from "@/protobuf/core/protobuf/entities";
import {
  ChatWithDetailsPB,
  HistoryDaoServiceClient,
  HistoryLoaderServiceClient
} from "@/protobuf/backend/protobuf/services";
import { FileKey } from "@/app/utils/entity_utils";

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
