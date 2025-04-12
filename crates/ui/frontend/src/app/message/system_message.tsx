'use client'

import React from "react";

import { ReactChildren } from "@/app/utils/entity_utils";

export default function SystemMessage(args: {
  children: ReactChildren
}): React.JSX.Element {
  return (
    <blockquote><i>({args.children})</i></blockquote>
  )
}
