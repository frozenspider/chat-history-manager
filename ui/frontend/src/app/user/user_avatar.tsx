import React from "react";

import { User } from "@/protobuf/core/protobuf/entities";
import { DatasetState } from "@/app/utils/state";
import { Avatar } from "@/app/general/avatar";

export function UserAvatar(args: {
  user: User,
  dsState: DatasetState
}) {
  let relativePath = args.user.profilePictures.find(pp => pp.path)?.path ?? null
  return <Avatar relativePath={relativePath} maxSize={50} fallback={null} dsState={args.dsState}/>
}
