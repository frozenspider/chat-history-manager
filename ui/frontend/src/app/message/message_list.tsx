'use client'

import React from "react";

import { AssertDefined } from "@/app/utils/utils";
import MessagesLoadSpinner from "@/app/utils/load_spinner";
import { MessageComponent } from "@/app/message/message";
import { CurrentChatState, ChatViewState, DatasetState } from "@/app/utils/state";

export default function MessagesList(args: {
  state: CurrentChatState | null,
  viewState: ChatViewState | null,
}): React.JSX.Element {
  // TS is not smart enough to understand that cwd is not null otherwise
  let [state, viewState] = [args.state, args.viewState]
  if (!state || !viewState)
    return <></>

  AssertDefined(state.cwd.chat)
  AssertDefined(state.dsState.ds.uuid)

  return (
    <>
      <div className="p-4 space-y-4">
        {
          viewState.messages.map((msg) =>
            <MessageComponent key={state.dsState.ds.uuid + "_" + state.cwd.chat!.id + "_" + msg.internalId}
                              msg={msg}
                              state={state}
                              replyDepth={0}/>
          )
        }

        <div className="flex flex-col">
          <span className="font-semibold text-inherit-500">
            System Message <span className="text-sm text-gray-500">(2023-11-05 17:34:00)</span>
          </span>
          <p>
            <span className="font-semibold text-blue-500">Alex Johnson</span> has joined the group.
          </p>
        </div>
      </div>
    </>
  )
}

