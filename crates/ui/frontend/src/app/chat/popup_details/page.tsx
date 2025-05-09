'use client'

import React from "react";

import { AppEvents, EmitToSelf, EnsureDefined, Listen, PromiseCatchReportError } from "@/app/utils/utils";
import { CombinedChat } from "@/app/utils/entity_utils";
import { DatasetState } from "@/app/utils/state";

import LoadSpinner from "@/app/general/load_spinner";
import ChatFullDetailsComponent from "@/app/chat/chat_details_full";


export default function Home() {
  let [combinedChat, setCombinedChat] =
    React.useState<CombinedChat | null>(null)

  let [datasetState, setDatasetState] =
    React.useState<DatasetState | null>(null)

  React.useEffect(() => {
    // Cannot pass the payload directly because of BigInt, Map, etc. not being serializable by default
    let unlisten = Listen<string>(AppEvents.Popup.SetState, (ev) => {
      let json = ev.payload
      let [ccObj, dsStateObj] = JSON.parse(json)
      // Parsed object is not a class (it does not have methods)
      let cc = CombinedChat.fromObject(EnsureDefined(ccObj))
      let dsState = DatasetState.fromJSON(EnsureDefined(dsStateObj))
      setCombinedChat(cc)
      setDatasetState(dsState)
    })

    PromiseCatchReportError(EmitToSelf(AppEvents.Popup.Ready));

    return () => PromiseCatchReportError(async () => {
      return (await unlisten)()
    })
  })

  if (!combinedChat || !datasetState) {
    return <LoadSpinner center={true} text="Loading..."/>
  }

  return (
    <ChatFullDetailsComponent cc={combinedChat} dsState={datasetState} />
  )
}
