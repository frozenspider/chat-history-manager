'use client'

import React from "react";

import Contact from "@/app/contact/contact";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";

export default function ContactList(args: { cwds: ChatWithDetailsPB[] }): React.JSX.Element {
  console.log("cwds: ", args.cwds)
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {args.cwds.map((cwd) =>
        <Contact key={cwd.chat?.id} cwd={cwd}/>
      )}
    </ul>
  )
}

