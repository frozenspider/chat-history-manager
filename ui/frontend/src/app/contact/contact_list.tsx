'use client'

import React from "react";

import Contact from "@/app/contact/contact";
import { GetOrNull } from "@/app/utils";

import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import { User } from "@/protobuf/core/protobuf/entities";


export default function ContactList(args: {
  cwds: ChatWithDetailsPB[],
  users: Map<number, User>,
  myselfId: number
}): React.JSX.Element {
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {
        args.cwds
          .filter((cwd) => {
            if (!cwd.chat) return false
            let mainChatId = GetOrNull(cwd.chat.main_chat_id)
            // TODO: Why is it zero?
            return mainChatId === null || mainChatId === 0
          })
          .map((cwd) =>
            <Contact key={cwd.chat?.id} cwd={cwd} users={args.users} myselfId={args.myselfId}/>
          )
      }
    </ul>
  )
}

