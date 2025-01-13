'use client'

import React from "react";

import {
  AppEvents,
  Asc,
  EmitToSelf,
  EnsureDefined,
  Listen,
  PromiseCatchReportError,
  SerializeJson
} from "@/app/utils/utils";
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

import { DatasetState } from "@/app/utils/state";
import LoadSpinner from "@/app/general/load_spinner";
import ListEntities from "@/app/general/list_entities";
import ChatEntryTechnical from "@/app/chat/chat_entry_technical";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ScrollArea } from "@/components/ui/scroll-area";


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
    let unlisten = Listen<string>(AppEvents.Popup.SetState, (ev) => {
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

    PromiseCatchReportError(EmitToSelf(AppEvents.Popup.Ready));

    return () => PromiseCatchReportError(async () => {
      return (await unlisten)()
    })
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
            await EmitToSelf(AppEvents.Popup.Confirmed, SerializeJson(cwd.chat!.id))
            await getCurrentWindow().close()
          })
        }
      }}
      render={(idxCwds, isSelected, onClick) => (
        <ScrollArea className="flex-grow h-[calc(100vh-200px)] border rounded-md">
          <div className="p-1">
            {idxCwds.map(([idx, cwd]) =>
              <ChatEntryTechnical key={`cwd${idx}`}
                                  cwd={cwd}
                                  dsState={datasetState!}
                                  isSelected={isSelected(idx)}
                                  onClick={() => onClick(idx, cwd)}/>)}
          </div>
        </ScrollArea>
      )}/>
  </>
}
