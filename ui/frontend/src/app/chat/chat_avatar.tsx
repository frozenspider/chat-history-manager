import React from "react";

import { ChatType } from "@/protobuf/core/protobuf/entities";
import { DatasetState } from "@/app/utils/state";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import { Avatar } from "@/app/utils/avatar";
import { Users } from "lucide-react";
import { CombinedChat, GetChatPrettyName, GetCombinedChat1to1Interlocutors } from "@/app/utils/entity_utils";

export function ChatAvatar(args: {
  cc: CombinedChat,
  dsState: DatasetState
}) {
  let cwds = [args.cc.mainCwd, ...args.cc.cwds]
  let mainChat = args.cc.mainCwd.chat!
  let relativePath =
    GetNonDefaultOrNull(cwds.map(cwd => cwd.chat!.imgPathOption).find(p => p))
  if (!relativePath) {
    let interlocutors = GetCombinedChat1to1Interlocutors(args.cc)
    let pp = interlocutors.flatMap(i => i.profilePictures).find(pp => pp.path)
    if (pp) {
      relativePath = pp.path
    }
  }
  let fallback = mainChat.tpe === ChatType.PRIVATE_GROUP ?
    <Users width="50%" height="50%"/> :
    <span className="opacity-30">{GetChatPrettyName(mainChat).split(/[ +0-9()\[\]\\{}]/).map(word => word[0])}</span>
  return <Avatar relativePath={relativePath} maxSize={50} fallback={fallback} dsState={args.dsState}/>
}
