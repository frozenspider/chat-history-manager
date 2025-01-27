import React from "react";

import { User } from "@/protobuf/core/protobuf/entities";
import { DatasetState } from "@/app/utils/state";
import { FindExistingPathAsync } from "@/app/utils/utils";
import { Avatar } from "@/app/general/avatar";

export function UserAvatar(args: {
  user: User,
  dsState: DatasetState
}) {
  let relativePathAsync = async () => {
    return FindExistingPathAsync(
      args.user.profilePictures
        .filter(pp => pp.path)
        .map(pp => pp.path),
      args.dsState.dsRoot
    )
  }
  return <Avatar relativePathAsync={relativePathAsync} maxSize={50} fallback={null} dsState={args.dsState}/>
}
