'use client'

import React from "react";

import { AssertDefined } from "@/app/utils/utils";
import MessagesLoadSpinner from "@/app/message/load_spinner";
import { MessageComponent } from "@/app/message/message";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import { ChatViewState, DatasetState } from "@/app/utils/state";

export default function MessagesList(args: {
  state: [DatasetState, ChatWithDetailsPB] | null,
  viewState: ChatViewState | null,
}): React.JSX.Element {
  // TS is not smart enough to understand that cwd is not null otherwise
  let [state, viewState] = [args.state, args.viewState]
  if (!state || !viewState)
    return <></>

  let [dsState, cwd] = state
  AssertDefined(dsState.ds.uuid)
  AssertDefined(cwd.chat)

  return (
    <>
      <div className="p-4 space-y-4">
        {
          viewState.messages.map((msg) =>
            <MessageComponent key={dsState.ds.uuid + "_" + cwd.chat!.id + "_" + msg.internalId}
                              msg={msg}
                              cwd={cwd}
                              dsState={dsState}
                              replyDepth={0}/>
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

