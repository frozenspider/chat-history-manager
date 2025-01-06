'use client'

import React from "react";

import { emit } from "@tauri-apps/api/event";

import { EnsureDefined, Listen, PromiseCatchReportError } from "@/app/utils/utils";
import { CombinedChat } from "@/app/utils/entity_utils";
import { DatasetState, PopupReadyEventName, SetPopupStateEventName } from "@/app/utils/state";

import LoadSpinner from "@/app/utils/load_spinner";
import ChatFullDetailsComponent from "@/app/chat/chat_details_full";

export default function Home() {
  let [combinedChat, setCombinedChat] =
    React.useState<CombinedChat | null>(null)

  let [datasetState, setDatasetState] =
    React.useState<DatasetState | null>(null)

  React.useEffect(() => {
    // Cannot pass the payload directly because of BigInt, Map, etc. not being serializable by default
    Listen<string>(SetPopupStateEventName, (ev) => {
      let json = ev.payload
      let [ccObj, dsStateObj] = JSON.parse(json)
      // Parsed object is not a class (it does not have methods)
      let cc = CombinedChat.fromObject(EnsureDefined(ccObj))
      let dsState = DatasetState.fromJSON(EnsureDefined(dsStateObj))
      setCombinedChat(cc)
      setDatasetState(dsState)
    })

    PromiseCatchReportError(emit(PopupReadyEventName));
  })

  if (!combinedChat || !datasetState) {
    return <LoadSpinner center={true} text="Loading..."/>
  }

  return (
    <ChatFullDetailsComponent cc={combinedChat} dsState={datasetState} />
  )
}
