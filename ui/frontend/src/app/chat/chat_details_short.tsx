import React from "react";

import {
  ChatSourceTypeToString,
  ChatTypeToString,
  CombinedChat,
  GetChatInterlocutor,
  GetChatPrettyName,
  GetUserPrettyName,
  IdToReadable,
  NameColorClassFromNumber
} from "@/app/utils/entity_utils";
import { DatasetState } from "@/app/utils/state";

import { ChatType } from "@/protobuf/core/protobuf/entities";

import { ChatAvatar } from "@/app/chat/chat_avatar";
import ColoredName from "@/app/message/colored_name";
import { Badge } from "@/components/ui/badge";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";

export default function ChatShortDetailsComponent(args: {
  cwd: ChatWithDetailsPB,
  dsState: DatasetState,
  isSelected: boolean
  onClick: (cc: ChatWithDetailsPB, dsState: DatasetState) => void
}): React.JSX.Element {
  const chat = args.cwd.chat!
  const name = GetChatPrettyName(chat)
  const singleChatCc = new CombinedChat(args.cwd, [])
  const colorClass = NameColorClassFromNumber(chat.id).text

  let interlocutor = GetChatInterlocutor(args.cwd)

  return <div key={chat.id} className={`mb-2 ${args.isSelected ? 'bg-blue-100 dark:bg-blue-900 rounded-lg' : ''}`}>
    <button
      className={`w-full p-3 ${
        args.isSelected ? '' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      } flex items-start space-x-3 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg text-left transition-colors duration-200 ${
        args.isSelected ? 'bg-blue-200 dark:bg-blue-800' : 'bg-white dark:bg-gray-950'
      }`}
      onClick={() => {
        args.onClick(args.cwd, args.dsState)
      }}
    >

      <ChatAvatar cc={singleChatCc} dsState={args.dsState}/>

      <div className="flex-grow">
        <div className="flex items-center justify-between">
          <p className="font-medium">
            <ColoredName name={name} colorClass={colorClass}
                         addedClasses="line-clamp-1 break-all"/>
            {interlocutor?.usernameOption && <span className="ml-3 text-sm text-gray-500">@{interlocutor.usernameOption}</span>}
          </p>
          <Badge variant="outline" className="ml-2">
            {ChatSourceTypeToString(chat.sourceType)}
          </Badge>
        </div>
        <p className="text-sm text-gray-500 break-all">
          ID: <span className="select-text">{IdToReadable(chat.id)}</span>
        </p>
        <p className="text-sm text-gray-500">
          {ChatTypeToString(chat.tpe)} • {chat.msgCount} messages
        </p>
        {chat.tpe === ChatType.PRIVATE_GROUP && (
          <p className="text-sm text-gray-500">
            Participants: {args.cwd.members.map(user => GetUserPrettyName(user)).join(', ')}
          </p>
        )}
        {chat.tpe === ChatType.PERSONAL && interlocutor?.phoneNumberOption && (
          <p className="text-sm text-gray-500">
            {interlocutor.phoneNumberOption}
          </p>
        )}
      </div>
    </button>
  </div>
}
