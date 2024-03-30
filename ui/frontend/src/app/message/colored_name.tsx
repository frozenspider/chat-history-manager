'use client'

import React from "react";

export default function ColoredName(args: {
  name: string,
  colorClass: string,
  isDeleted?: boolean,
  children?: React.ReactNode,
}): React.JSX.Element {
  return (
    <span className={["font-semibold", args.colorClass, args.isDeleted ? 'line-through' : ''].join(" ")}>
      {args.name}
      {args.children}
    </span>
  )
}

