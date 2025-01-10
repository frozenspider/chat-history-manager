import React from "react";

import { ChatType } from "@/protobuf/core/protobuf/entities";
import { DatasetState } from "@/app/utils/state";
import { FindExistingPathAsync, GetNonDefaultOrNull } from "@/app/utils/utils";
import { Avatar } from "@/app/general/avatar";
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

  let relativePathAsync = async () => {
    let interlocutors = GetCombinedChat1to1Interlocutors(args.cc)
    let pics = [
      relativePath,
      ...interlocutors
        .flatMap(i => i.profilePictures)
        .filter(pp => pp.path)
        .map(pp => pp.path)
    ].filter(p => p).map(p => p!)
    return FindExistingPathAsync(pics, args.dsState.dsRoot)
  }

  let fallback = mainChat.tpe === ChatType.PRIVATE_GROUP ?
    <Users width="50%" height="50%"/> :
    <span className="opacity-30">{GetChatPrettyName(mainChat).split(/[ +0-9()\[\]\\{}]/).map(word => word[0])}</span>
  return <Avatar relativePathAsync={relativePathAsync} maxSize={50} fallback={fallback} dsState={args.dsState}/>
}
