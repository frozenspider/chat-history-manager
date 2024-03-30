'use client'

import React from "react";

import Contact from "@/app/contact/contact";
import { GetOrNull } from "@/app/utils";

import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import { User } from "@/protobuf/core/protobuf/entities";


export default function ContactList(args: {
  cwds: ChatWithDetailsPB[],
  users: Map<bigint, User>,
  myselfId: bigint
}): React.JSX.Element {
  const Zero: bigint = BigInt(0)
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {
        args.cwds
          .filter((cwd) => {
            if (!cwd.chat) return false
            let mainChatId = GetOrNull(cwd.chat.main_chat_id)
            // TODO: Why is it zero?
            return mainChatId === null || mainChatId == Zero
          })
          .map((cwd) =>
            <Contact key={cwd.chat?.id.toString()} cwd={cwd} users={args.users} myselfId={args.myselfId}/>
          )
      }
    </ul>
  )
}

