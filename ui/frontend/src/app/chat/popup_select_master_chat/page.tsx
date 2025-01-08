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
import LoadSpinner from "@/app/chat/general/load_spinner";
import ChatShortDetailsComponent from "@/app/chat/chat_details_short";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ListEntities from "@/app/chat/general/list_entities";

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
    React.useState(false)

  React.useEffect(() => {
    // Cannot pass the payload directly because of BigInt, Map, etc. not being serializable by default
    PromiseCatchReportError(Listen<string>(SetPopupStateEventName, (ev) => {
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
    }))

    PromiseCatchReportError(emit(PopupReadyEventName));
  })

  const filter = React.useCallback((cwd: ChatWithDetailsPB, searchTerm: string) => {
    let termLc = searchTerm.toLowerCase()
    let chat = cwd.chat!
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
    ) || false
  }, [combinedChat])

  const cwds = React.useMemo(() => {
    let cwds = Array.from(datasetState?.cwds ?? [])
    cwds.sort((a, b) => Asc(a.chat!.id, b.chat!.id))

    // Filter out:
    // * Chat we're currently looking at
    // * Slave chats
    // * Non-personal chats (if configured)
    cwds = cwds.filter(cwd => {
      let chat = cwd.chat!
      return (
        chat.id != combinedChat?.mainChatId &&
        (!chat.mainChatId || chat.mainChatId <= 0) &&
        (!showPersonalChatsOnly || chat.tpe == ChatType.PERSONAL)
      )
    })

    return cwds
  }, [datasetState])

  if (!combinedChat || !cwds) {
    return <LoadSpinner center={true} text="Loading..."/>
  }

  return <>
    <ListEntities
      entities={cwds}
      filter={filter}
      isDangerous={isDestructive}
      description={alertText}
      searchBarText="Search chats..."
      selectButton={{
        text: "Confirm",
        action: (cwd: ChatWithDetailsPB) => {
          PromiseCatchReportError(async () => {
            await emit(PopupConfirmedEventName, cwd.chat!.id)
            await getCurrentWindow().close()
          })
        }
      }}
      render={function (idx: number, cwd: ChatWithDetailsPB, isSelected: boolean, onClick: () => void): React.ReactNode {
        return <ChatShortDetailsComponent key={`cwd${idx}`}
                                          cwd={cwd}
                                          dsState={datasetState!}
                                          isSelected={isSelected}
                                          onClick={onClick}/>
      }}/>
  </>
}
