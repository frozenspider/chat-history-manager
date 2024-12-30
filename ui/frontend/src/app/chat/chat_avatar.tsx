import React from "react";

import { Chat, ChatType } from "@/protobuf/core/protobuf/entities";
import { DatasetState } from "@/app/utils/state";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import { Avatar } from "@/app/utils/avatar";
import { Users } from "lucide-react";
import { GetChatPrettyName } from "@/app/utils/entity_utils";

export function ChatAvatar(args: {
  chat: Chat,
  dsState: DatasetState
}) {
  let relativePath = GetNonDefaultOrNull(args.chat.imgPathOption)
  if (!relativePath && args.chat.tpe == ChatType.PERSONAL) {
    let otherMemberIds = args.chat.memberIds.filter(id => id != args.dsState.myselfId)
    // Could be that no other members are known - might happen e.g. when interlocutor didn't write anything
    if (otherMemberIds.length == 1) {
      let otherMemberId = otherMemberIds[0]
      let user = args.dsState.users.get(otherMemberId)
      relativePath = user && user.profilePictures.length > 0 ? user.profilePictures[0].path : null
    }
  }
  let fallback = args.chat.tpe === ChatType.PRIVATE_GROUP ?
    <Users width="50%" height="50%"/> :
    <span className="opacity-30">{ GetChatPrettyName(args.chat).split(/[ +0-9()\[\]\\{}]/).map(word => word[0]) }</span>
  return <Avatar relativePath={relativePath} maxSize={50} fallback={fallback} dsState={args.dsState}/>
}
