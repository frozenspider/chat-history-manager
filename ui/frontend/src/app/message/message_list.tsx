'use client'

import React from "react";

import { AssertDefined } from "@/app/utils/utils";
import MessagesLoadSpinner from "@/app/message/load_spinner";
import { MessageComponent } from "@/app/message/message";
import { Message, User } from "@/protobuf/core/protobuf/entities";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import { DatasetState } from "@/app/utils/state";

export default function MessagesList(args: {
  cwd: ChatWithDetailsPB | null,
  messages: Message[],
  context: DatasetState | null
}): React.JSX.Element {
  // TS is not smart enough to understand that cwd is not null otherwise
  let [cwd, cxt] = [args.cwd, args.context]
  if (!cwd || !cxt)
    return <></>

  return (
    <>
      <div className="p-4 space-y-4">
        {
          args.messages.map((msg) =>
            <MessageComponent
              key={AssertDefined(cxt.ds.uuid) + "_" + AssertDefined(cwd.chat).id + "_" + msg.internalId}
              msg={msg}
              cwd={cwd}
              replyDepth={0}
              context={cxt}/>
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
      <MessagesLoadSpinner center={true}/>
    </>
  )
}

