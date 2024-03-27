'use client'

import React from "react";

import MessagesLoadSpinner from "@/app/message/load_spinner";
import { MessageComponent } from "@/app/message/message";
import { Message } from "@/protobuf/core/protobuf/entities";

export default function MessagesList(args: {
  dsUuid: string,
  dsRoot: string
  chatId: number,
  messages: Message[],
}): React.JSX.Element {

  return (
    <>
      <div className="p-4 space-y-4">
        <div className="flex flex-col">
          <span className="font-semibold text-blue-500">
            John Doe <span className="text-sm text-gray-500">(2023-11-05 17:30:00)</span>
          </span>
          <p>Hello, how can I help you?</p>
        </div>

        {args.messages.map((msg) =>

          <MessageComponent key={args.dsUuid + "_" + args.chatId + "_" + msg.internal_id}
                            msg={msg}
                            dsRoot={args.dsRoot}/>)}

        <div className="flex flex-col">
          <span className="font-semibold text-green-500">
            Jane Smith <span className="text-sm text-gray-500">(2023-11-05 17:31:00)</span>
          </span>
          <p>{"I'm having trouble with my account"}.</p>
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-blue-500">
            John Doe <span className="text-sm text-gray-500">(2023-11-05 17:32:00)</span>
          </span>
          <p>Could you please elaborate on the issue?</p>
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-green-500">
            Jane Smith <span className="text-sm text-gray-500">(2023-11-05 17:33:00)</span>
          </span>
          <p>{"Here's a photo of the error message I'm getting."}</p>
          <img
            alt="Shared Photo"
            className="rounded-md mt-2"
            height="200"
            src="/placeholder.svg"
            style={{
              aspectRatio: "200/200",
              objectFit: "cover",
            }}
            width="200"
          />
        </div>
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

