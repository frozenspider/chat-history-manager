'use client'

import React from "react";

import { AssertDefined } from "@/app/utils";
import MessagesLoadSpinner from "@/app/message/load_spinner";
import { MessageComponent } from "@/app/message/message";
import { Message, User } from "@/protobuf/core/protobuf/entities";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";

export default function MessagesList(args: {
  dsUuid: string,
  dsRoot: string
  cwd: ChatWithDetailsPB,
  messages: Message[],
  users: Map<bigint, User>
}): React.JSX.Element {

  return (
    <>
      <div className="p-4 space-y-4">
        {
          args.messages.map((msg) =>
            <MessageComponent key={args.dsUuid + "_" + AssertDefined(args.cwd.chat).id + "_" + msg.internalId}
                              msg={msg}
                              cwd={args.cwd}
                              users={args.users}
                              dsRoot={args.dsRoot}/>
          )
        }

        <div className="flex flex-col">
          <span className="font-semibold text-blue-500">
            System Message <span className="text-sm text-gray-500">(2023-11-05 17:34:00)</span>
          </span>
          <p>
            <span className="font-semibold text-blue-500">Alex Johnson</span> has joined the group.
          </p>
        </div>
      </div>
      <MessagesLoadSpinner/>
    </>
  )
}

