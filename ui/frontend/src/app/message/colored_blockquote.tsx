'use client'

import React from "react";

import { ReactChildren } from "@/app/utils/entity_utils";

export default function ColoredBlockquote(args: {
  borderColorClass: string,
  children: ReactChildren,
  preWrap?: boolean
}): React.JSX.Element {
  return (
    <blockquote className={"border-l-4 pl-2 " + args.borderColorClass + (args.preWrap ? " whitespace-pre-wrap" : "")}>
      {args.children}
    </blockquote>
  )
}

