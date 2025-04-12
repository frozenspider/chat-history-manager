'use client'

import React from "react";

import { DatasetState, LoadedFileState } from "@/app/utils/state";
import { AppEvent, Asc, Noop } from "@/app/utils/utils";
import { GetUserPrettyName, IdToReadable } from "@/app/utils/entity_utils";

import { User } from "@/protobuf/core/protobuf/entities";

import ListEntities from "@/app/general/list_entities";
import { ScrollArea } from "@/components/ui/scroll-area";
import UserEntryTechncal from "@/app/user/user_entry_technical";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";


// Can't define it in popup_manage_users/page.tsx because of a Next.js bug
export const UserUpdatedEvent: AppEvent = "user-updated" as AppEvent

export default function ManageUsers(args: {
  openFiles: LoadedFileState[],
  updateUser: (newUser: User, dsState: DatasetState) => void,
}) {
  const [userToEdit, setUserToEdit] =
    React.useState<[User, DatasetState] | null>(null)

  const filter =
    React.useCallback(([u, _dsState]: [User, DatasetState], searchTerm: string) => {
      let termLc = searchTerm.toLowerCase()
      if (
        termLc == "" ||
        u.id.toString().includes(termLc) ||
        IdToReadable(u.id).includes(termLc) ||
        GetUserPrettyName(u).toLowerCase().includes(termLc) ||
        u.usernameOption?.toLowerCase().includes(termLc) ||
        u.phoneNumberOption?.toLowerCase().includes(termLc)
      ) return true
      return false
    }, [args.openFiles])

  const usersWithDsStates = React.useMemo(() => {
    // Can't user flatMap because it can't differentiate between array and a tuple
    let usersWithDsStates: [User, DatasetState][] = []
    for (let f of args.openFiles) {
      for (let ds of f.datasets) {
        for (let u of ds.users.values()) {
          usersWithDsStates.push([u, ds])
        }
      }
    }
    // There might be duplicating IDs across different datasets, we don't care
    usersWithDsStates.sort((a, b) => Asc(a[0].id, b[0].id))
    return usersWithDsStates
  }, [args.openFiles])

  const handleDoubleClick = React.useCallback((user: User, dsState: DatasetState) => {
    setUserToEdit([user, dsState])
  }, [])

  // TODO: Add per-file per-dataset tabs
  return (
    <div>
      <ListEntities
        entities={usersWithDsStates}
        filter={filter}
        isDangerous={false}
        description={"Double-click to edit"}
        searchBarText="Search users..."
        selectButton={null}
        render={(idxUsersDs, isSelected, _onClick) => (
          <ScrollArea className="flex-grow h-[calc(100vh-200px)] border rounded-md">
            <div className="p-1">
              {idxUsersDs.map(([idx, [user, dsState]]) =>
                <UserEntryTechncal key={`f${dsState.fileKey}_ds${dsState.ds.uuid!.value}_u${user.id}`}
                                   user={user}
                                   dsState={dsState}
                                   isSelected={isSelected(idx)}
                                   onClick={() => Noop()}
                                   onDoubleClick={handleDoubleClick}/>)}
            </div>
          </ScrollArea>
        )}/>
      <EditUserDialog userToEdit={userToEdit} setUserToEdit={setUserToEdit} updateUser={args.updateUser}/>
    </div>
  )
}


function EditUserDialog(args: {
  userToEdit: [User, DatasetState] | null,
  setUserToEdit: (v: [User, DatasetState] | null) => void,
  updateUser: (u: User, dsState: DatasetState) => void,
}): React.JSX.Element {
  const handleUpdateUser =
    React.useCallback((e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!args.userToEdit) return
      args.updateUser(...args.userToEdit)
      args.setUserToEdit(null)
    }, [args])

  // Can be tweaked to do validation but meh
  const handleInputChange =
    React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      if (args.userToEdit) {
        args.setUserToEdit([
          {
            ...args.userToEdit[0],
            [e.target.name]: e.target.value.trim() ?? ""
          },
          args.userToEdit[1]
        ])
      }
    }, [args.userToEdit, args.setUserToEdit])

  return <Dialog open={args.userToEdit != null}
                 onOpenChange={(isOpen) => isOpen ? Noop() : args.setUserToEdit(null)}>
    <DialogContent className="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle></DialogTitle>
      </DialogHeader>
      <DialogDescription />
      <form onSubmit={handleUpdateUser}>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="fileKey" className="text-right" >
              Database Path
            </Label>

            <Input
              id="fileKey"
              name="fileKey"
              value={args.userToEdit ? args.userToEdit[1].fileKey : ""}
              className="col-span-3"
              disabled
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="dsUuid" className="text-right">
              Dataset UUID
            </Label>

            <Input
              id="dsUuid"
              name="dsUuid"
              value={args.userToEdit ? args.userToEdit[1].ds.uuid!.value : ""}
              className="col-span-3"
              disabled
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="id" className="text-right">
              ID
            </Label>

            <Input
              id="id"
              name="id"
              value={args.userToEdit ? IdToReadable(args.userToEdit[0].id) : ""}
              className="col-span-3"
              disabled
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="firstNameOption" className="text-right">
              First Name
            </Label>
            <Input
              id="firstNameOption"
              name="firstNameOption"
              value={(args.userToEdit ? args.userToEdit[0].firstNameOption : "") ?? ""}
              onChange={handleInputChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="lastNameOption" className="text-right">
              Last Name
            </Label>
            <Input
              id="lastNameOption"
              name="lastNameOption"
              value={(args.userToEdit ? args.userToEdit[0].lastNameOption : "") ?? ""}
              onChange={handleInputChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="usernameOption" className="text-right">
              Username
            </Label>
            <Input
              id="usernameOption"
              name="usernameOption"
              value={(args.userToEdit ? args.userToEdit[0].usernameOption : "") ?? ""}
              onChange={handleInputChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phoneNumberOption" className="text-right">
              Phone
            </Label>
            <Input
              id="phoneNumberOption"
              name="phoneNumberOption"
              value={(args.userToEdit ? args.userToEdit[0].phoneNumberOption : "") ?? ""}
              onChange={handleInputChange}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button  type="submit">Save changes</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
