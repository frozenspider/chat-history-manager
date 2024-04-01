'use client'

import React from "react";

import { NameColorClassFromPrettyName } from "@/app/utils/entity_utils";
import ColoredName from "@/app/message/colored_name";

import { User } from "@/protobuf/core/protobuf/entities";

export default function ColoredMembersList(args: {
  memberNames: string[],
  members: User[],
  oneLine?: boolean
}): React.JSX.Element {
  if (args.memberNames.length == 0) {
    return <></>
  }
  let coloredNames = args.memberNames.map(n => {
    let colorClass = NameColorClassFromPrettyName(n, args.members).text
    // eslint-disable-next-line react/jsx-key
    return <ColoredName name={n} colorClass={colorClass}/>
  })


  if (args.oneLine) {
    return <>
      {coloredNames
        .flatMap((el, idx) =>
          idx == 0 ? [el] : [", ", el])
        .map((el, idx) =>
          <span key={idx}>{el}</span>)}
    </>
  } else {
    return (
      <ul className="list-disc pl-4">
        {coloredNames.map((el, idx) => <li key={idx}>{el}</li>)}
      </ul>
    )
  }
}

