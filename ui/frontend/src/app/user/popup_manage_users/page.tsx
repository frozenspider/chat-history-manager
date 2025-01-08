'use client'

import React from "react";

import { EmitToSelf, EnsureDefined, Listen, PromiseCatchReportError, SerializeJson } from "@/app/utils/utils";

import {
  DatasetState,
  LoadedFileState,
  PopupReadyEventName,
  SetPopupStateEventName
} from "@/app/utils/state";
import LoadSpinner from "@/app/general/load_spinner";
import ManageUsers, { UserUpdatedEventName } from "@/app/user/manage_users";
import { User } from "@/protobuf/core/protobuf/entities";

export default function Home() {
  let [openFiles, setOpenFiles] =
    React.useState<LoadedFileState[] | null>(null)

  React.useEffect(() => {
    // Cannot pass the payload directly because of BigInt, Map, etc. not being serializable by default
    let unlisten = Listen<string>(SetPopupStateEventName, (ev) => {
      let json = ev.payload
      let fileStatesObj = JSON.parse(json)
      // Parsed object is not a class (it does not have methods)
      let fileStates: LoadedFileState[] = fileStatesObj.map(LoadedFileState.fromJSON)
      setOpenFiles(EnsureDefined(fileStates))
    })

    PromiseCatchReportError(EmitToSelf(PopupReadyEventName));

    return () => PromiseCatchReportError(async () => {
      return (await unlisten)()
    })
  }, [])

  // New user should have the same ID as before
  let updateUser = React.useCallback((newUser: User, dsState: DatasetState) => {
    PromiseCatchReportError(EmitToSelf(UserUpdatedEventName, SerializeJson([newUser, dsState])))
  }, [setOpenFiles])

  if (!openFiles) {
    return <LoadSpinner center={true} text="Loading..."/>
  }

  return <>
    <ManageUsers openFiles={openFiles} updateUser={updateUser}/>
  </>
}
