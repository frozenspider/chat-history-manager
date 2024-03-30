import { Dataset, User } from "@/protobuf/core/protobuf/entities";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";

export interface LoadedFileState {
  key: string
  name: string
  datasets: DatasetState[]
}

export interface DatasetState {
  // To identify our dataset to the backend, we need (fileKey, dsUuid) pair.
  fileKey: string
  ds: Dataset,
  users: Map<bigint, User>,
  myselfId: bigint,
  cwds: ChatWithDetailsPB[]
}
