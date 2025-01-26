'use client'

import React from "react";

import { Dataset, User } from "@/protobuf/core/protobuf/entities";
import {
  ChatWithDetailsPB,
  HistoryDaoServiceClient,
  HistoryDaoServiceDefinition,
  HistoryLoaderServiceClient,
  HistoryLoaderServiceDefinition,
  MergeServiceClient,
  MergeServiceDefinition
} from "@/protobuf/backend/protobuf/services";
import { FileKey } from "@/app/utils/entity_utils";
import { createChannel, createClientFactory } from "nice-grpc-web";
import { EnsureDefined } from "@/app/utils/utils";


//
// gRPC service clients context
//

export const ServicesContext =
  React.createContext<GrpcServices | null>(null)

export interface GrpcServices {
  loadClient: HistoryLoaderServiceClient
  daoClient: HistoryDaoServiceClient
  mergeClient: MergeServiceClient
}

export function CreateGrpcServicesOnce(port: number) {
  // No-dependency useMemo ensures that the services are created only once
  return React.useMemo<GrpcServices>(() => {
    const clientFactory = createClientFactory()
    const channel = createChannel(`http://localhost:${port}`);
    return {
      loadClient: clientFactory.create(HistoryLoaderServiceDefinition, channel),
      daoClient: clientFactory.create(HistoryDaoServiceDefinition, channel),
      mergeClient: clientFactory.create(MergeServiceDefinition, channel)
    }
  }, [])
}

export function GetServices(): GrpcServices {
  let services = React.useContext(ServicesContext)
  if (!services) {
    throw new Error("Services context is not set up!")
  }
  return services
}

//
// Different kinds of state
//

export interface LoadedFileState {
  key: FileKey
  name: string
  storagePath: string
  datasets: DatasetState[]
}

export const LoadedFileState = {
  fromJSON: (obj: any): LoadedFileState => {
    return {
      key: EnsureDefined(obj.key),
      name: EnsureDefined(obj.name),
      storagePath: EnsureDefined(obj.name),
      datasets: EnsureDefined(obj.datasets).map(DatasetState.fromJSON),
    }
  }
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

export const DatasetState = {
  fromJSON: (obj: any): DatasetState => {
    return {
      fileKey: obj.fileKey,
      ds: Dataset.fromJSON(obj.ds),
      dsRoot: obj.dsRoot,
      users: new Map(obj.users.map((kv: any) => [BigInt(kv[0]), User.fromJSON(kv[1])])),
      myselfId: BigInt(obj.myselfId),
      cwds: obj.cwds.map(ChatWithDetailsPB.fromJSON)
    }
  }
}

/** Navigation callbacks, used to navigate to different time points in chat history */
export interface NavigationCallbacks {
  toBeginning(): Promise<void>,

  toEnd(): Promise<void>,

  // toDate(date: Date): void,
}
