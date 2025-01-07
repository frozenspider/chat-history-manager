'use client'

import React from "react";

import { emit } from "@tauri-apps/api/event";
import { Asc, EnsureDefined, Listen, PromiseCatchReportError } from "@/app/utils/utils";
import {
  ChatSourceTypeToString,
  ChatTypeToString,
  CombinedChat,
  GetChatInterlocutor,
  GetUserPrettyName,
  IdToReadable
} from "@/app/utils/entity_utils";

import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import { ChatType } from "@/protobuf/core/protobuf/entities";

import { DatasetState, PopupConfirmedEventName, PopupReadyEventName, SetPopupStateEventName } from "@/app/utils/state";
import LoadSpinner from "@/app/utils/load_spinner";
import ChatShortDetailsComponent from "@/app/chat/chat_details_short";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function Home() {
  let [combinedChat, setCombinedChat] =
    React.useState<CombinedChat | null>(null)

  let [datasetState, setDatasetState] =
    React.useState<DatasetState | null>(null)

  let [alertText, setAlertText] =
    React.useState<string | null>(null)

  let [showPersonalChatsOnly, setShowPersonalChatsOnly] =
    React.useState<boolean>(false)

  let [isDestructive, setIsDestructive] =
    React.useState("")

  let [searchTerm, setSearchTerm] =
    React.useState("")

  let [selectedChatId, setSelectedChatId] =
    React.useState<bigint | null>(null)

  React.useEffect(() => {
    // Cannot pass the payload directly because of BigInt, Map, etc. not being serializable by default
    Listen<string>(SetPopupStateEventName, (ev) => {
      let json = ev.payload
      let [ccObj, dsStateObj, alertTextStr, personalOnly, isDestructive] = JSON.parse(json)
      // Parsed object is not a class (it does not have methods)
      let cc = CombinedChat.fromObject(EnsureDefined(ccObj))
      let dsState = DatasetState.fromJSON(EnsureDefined(dsStateObj))
      setCombinedChat(cc)
      setDatasetState(dsState)
      setAlertText(EnsureDefined(alertTextStr))
      setShowPersonalChatsOnly(EnsureDefined(personalOnly))
      setIsDestructive(EnsureDefined(isDestructive))
    })

    PromiseCatchReportError(emit(PopupReadyEventName));
  })

  const filteredMasterCwds = React.useMemo(() => {
    let cwds = Array.from(datasetState?.cwds ?? [])
    cwds.sort((a, b) => Asc(a.chat!.id, b.chat!.id))
    let termLc = searchTerm.toLowerCase()
    return cwds.filter(cwd => {
        let chat = cwd.chat!
        // Filter out:
        // * Chat we're currently looking at
        // * Slave chats
        // * Non-personal chats (if configured)
        if (
          chat.id == combinedChat?.mainChatId ||
          (chat.mainChatId && chat.mainChatId > 0) ||
          (showPersonalChatsOnly && chat.tpe != ChatType.PERSONAL)
        ) return false
        if (
          termLc == "" ||
          chat.id.toString().includes(termLc) ||
          IdToReadable(chat.id).includes(termLc) ||
          chat.nameOption?.toLowerCase()?.includes(termLc) ||
          ChatSourceTypeToString(chat.sourceType).toLowerCase()?.includes(termLc) ||
          ChatTypeToString(chat.tpe).toLowerCase().includes(termLc) ||
          chat.msgCount.toString().includes(searchTerm)
        ) return true
        // Member 0 is self, so member 1 is interlocutor
        let interlocutor = GetChatInterlocutor(cwd)
        return (
          GetUserPrettyName(interlocutor).includes(termLc) ||
          interlocutor?.usernameOption?.includes(termLc) ||
          interlocutor?.phoneNumberOption?.includes(termLc)
        )
      }
    )
  }, [combinedChat, datasetState, searchTerm])

  if (!combinedChat || !datasetState) {
    return <LoadSpinner center={true} text="Loading..."/>
  }

  const handleSelectChat = (cwd: ChatWithDetailsPB, _: DatasetState) => {
    let newId = cwd.chat!.id
    if (selectedChatId == newId) {
      setSelectedChatId(null)
    } else {
      setSelectedChatId(cwd.chat!.id)
    }
  }

  return <>
    <div className="w-full mx-auto p-6 md:p-10 flex flex-col h-screen">
      {alertText &&
          <Alert variant="default" className="mb-4">
            {isDestructive && <AlertTriangle className="h-4 w-4"/>}
              <AlertDescription>{
                alertText
                  .split("\n")
                  .map((line, idx) =>
                    <p key={idx}>{line.trim()}</p>
                  )
              }</AlertDescription>
          </Alert>}

      <Input type="text"
             placeholder="Search chats..."
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="mb-4"/>

      <ScrollArea className="flex-grow h-[calc(100vh-200px)] border rounded-md">
        <div className="p-1">
          {filteredMasterCwds.map((cwd) =>
            <ChatShortDetailsComponent key={`c${cwd.chat!.id}`}
                                       cwd={cwd} dsState={datasetState}
                                       isSelected={cwd.chat!.id === selectedChatId}
                                       onClick={handleSelectChat}/>)}
        </div>
      </ScrollArea>

      <Button variant={isDestructive ? "destructive" : "default"}
              className="mt-4"
              onClick={() => PromiseCatchReportError(async () => {
                await emit(PopupConfirmedEventName, selectedChatId)
                await getCurrentWindow().close()
              })}
              disabled={!selectedChatId}>
        Confirm
      </Button>
    </div>
  </>
}
