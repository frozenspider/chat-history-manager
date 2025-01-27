'use client'

import React from "react";

import { TimestampToString } from "@/app/utils/utils";

export default function MessageTimestamp(args: {
  timestamp: bigint,
  editOrDeleteTimestamp: bigint | undefined,
  isDeleted: boolean,
  includeSeconds: boolean
}): React.JSX.Element {
  let tsString =
    "(" + TimestampToString(args.timestamp, args.includeSeconds) + ")"
  let editString = (args.editOrDeleteTimestamp
    ? <span className="font-normal">
        &nbsp;({args.isDeleted ? "deleted" : "edited"}: {TimestampToString(args.editOrDeleteTimestamp, args.includeSeconds)})
      </span>
    : null);
  return (
    <span className="text-sm text-gray-500">{tsString}{editString}</span>
  )
}
