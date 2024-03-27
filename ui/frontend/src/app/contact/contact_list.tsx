'use client'

import React from "react";

import Contact from "@/app/contact/contact";
import { ChatWithDetails } from "@/app/page";

export default function ContactList(args: { cwds: ChatWithDetails[] }): React.JSX.Element {
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
      {args.cwds.map((cwd) =>
        <Contact key={cwd.chat.id} cwd={cwd}/>
      )}
    </ul>
  )
}

