'use client'

import React from "react";

import { ReactChildren } from "@/app/utils/entity_utils";

export default function ColoredName(args: {
  name: string,
  colorClass: string,
  isDeleted?: boolean,
  children?: ReactChildren,
}): React.JSX.Element {
  return (
    <span className={["font-semibold", args.colorClass, args.isDeleted ? 'line-through' : ''].join(" ")}>
      {args.name}
      {args.children}
    </span>
  )
}

