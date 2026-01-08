'use client'

import React from "react";

import { GetPrettyPhoneNumber, IdToReadable, NameColorClassFromNumber } from "@/app/utils/entity_utils";
import { DatasetState } from "@/app/utils/state";

import { User } from "@/protobuf/core/protobuf/entities";
import { UserAvatar } from "@/app/user/user_avatar";
import ColoredName from "@/app/message/colored_name";

export default function UserEntryTechncal(args: {
  user: User,
  dsState: DatasetState,
  isSelected: boolean
  onClick: (user: User, dsState: DatasetState) => void
  onDoubleClick?: (user: User, dsState: DatasetState) => void
}): React.JSX.Element {
  let colorClass = NameColorClassFromNumber(args.user.id).text

  return <>
    <div className={`${args.isSelected ? 'bg-blue-100 dark:bg-blue-900 rounded-lg' : ''}`}
         onClick={() => args.onClick(args.user, args.dsState)}
         onDoubleClick={() => args.onDoubleClick?.(args.user, args.dsState)}>
      <div
        className={`w-full p-3 ${
          args.isSelected ? '' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        } flex items-start space-x-3 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg text-left transition-colors duration-200 ${
          args.isSelected ? 'bg-blue-200 dark:bg-blue-800' : 'bg-white dark:bg-gray-950'
        }`}
      >

        <UserAvatar user={args.user} dsState={args.dsState}/>

        <div className="flex-grow grid grid-cols-[100px_1fr] gap-x-2 items-baseline">
          <Row caption="ID" value={IdToReadable(args.user.id)}/>
          {args.user.firstNameOption &&
              <Row caption="First Name" value={
                <ColoredName
                  name={args.user.firstNameOption}
                  colorClass={colorClass}
                  addedClasses="line-clamp-1 break-all"/>
              }/>}
          {args.user.lastNameOption &&
              <Row caption="Last Name" value={
                <ColoredName
                  name={args.user.lastNameOption}
                  colorClass={colorClass}
                  addedClasses="line-clamp-1 break-all"/>
              }/>}
          {args.user.usernameOption &&
              <Row caption="Username" value={args.user.usernameOption}/>}
          {args.user.phoneNumberOption &&
              <Row caption="Phone" value={GetPrettyPhoneNumber(args.user.phoneNumberOption)}/>}
        </div>
      </div>
    </div>
  </>
}

function Row(args: {
  caption: string,
  value: string | React.JSX.Element,
}): React.JSX.Element {
  return <>
    <span className="text-gray-500 select-none">{args.caption}:</span>
    <span className="select-text">{args.value}</span>
  </>
}
