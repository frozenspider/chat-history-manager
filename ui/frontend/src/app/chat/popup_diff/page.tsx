'use client'

import React from "react";

import Diff from "@/app/diff/diff";
import { CreateGrpcServicesOnce, DatasetState, ServicesContext, } from "@/app/utils/state";
import { ChatStateCache, ChatStateCacheContext } from "@/app/utils/chat_state";
import { AppEvents, Assert, EmitToSelf, EnsureDefined, Listen, Noop, PromiseCatchReportError } from "@/app/utils/utils";

import { Loader2 } from "lucide-react";
import { ChatAnalysis, } from "@/protobuf/backend/protobuf/services";
import { MessageComponent } from "@/app/message/message";
import { MakeMessagesDiffModel, MessagesDiffModel } from "@/app/diff/diff_model_messages";


export default function Home() {
  // TODO: How to pass port number synchronously from Rust?
  const services = CreateGrpcServicesOnce(50051);

  const [loadInProgressText, setLoadInProgressText] =
    React.useState<string | null>("Loading...");

  const [model, setModel] =
    React.useState<MessagesDiffModel | null>(null)

  const chatStateCache =
    React.useMemo<ChatStateCache>(() => new ChatStateCache(), [])

  React.useEffect(() => {
    // Cannot pass the payload directly because of BigInt, Map, etc. not being serializable by default
    let unlisten = Listen<string>(AppEvents.Popup.SetState, (ev) => {
      let json = ev.payload
      let [masterDsStateObj, slaveDsStateObj, analysisObj] = JSON.parse(json)
      // Parsed object is not a class (it does not have methods)
      let masterDsState = DatasetState.fromJSON(masterDsStateObj)
      let slaveDsState = DatasetState.fromJSON(slaveDsStateObj)
      let analysis = ChatAnalysis.fromJSON(EnsureDefined(analysisObj))
      PromiseCatchReportError(async () => {
        let model = await MakeMessagesDiffModel(masterDsState, slaveDsState, analysis, services)
        setModel(model)
        setLoadInProgressText(null)
      })
    })

    PromiseCatchReportError(EmitToSelf(AppEvents.Popup.Ready));

    return () => PromiseCatchReportError(async () => {
      return (await unlisten)()
    })
  }, [setLoadInProgressText, setModel])

  if (loadInProgressText) {
    return <Throbber text={loadInProgressText}/>;
  }

  Assert(!!model)
  return (
    <ServicesContext.Provider value={services}> <ChatStateCacheContext.Provider value={chatStateCache}>
      <main className="mx-auto p-4">
        <Diff description=""
              labels={["Left Chat", "Right Chat"]}
              diffsData={model}
              isToggleable={row =>
                row.tpe !== "no-change" && row.tpe !== "keep" && row.tpe !== "dont-add"}
              renderOne={([msg, chat, chatState]) =>
                <MessageComponent msg={msg} chat={chat} chatState={chatState} replyDepth={1}/>}
              setToggleableSelection={Noop}/>
      </main>
    </ChatStateCacheContext.Provider> </ServicesContext.Provider>
  );
}

function Throbber(args: { text: string }) {
  // return <LoadSpinner center={true} text="Loading..."/>
  return (
    <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
      <div className="flex items-center space-x-2">
        <Loader2 className="h-6 w-6 animate-spin"/>
        <span className="text-lg font-medium">{args.text}</span>
      </div>
    </div>
  )
}
