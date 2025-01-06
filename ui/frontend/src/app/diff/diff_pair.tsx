import React from "react";

import { Assert } from "@/app/utils/utils";

import { DiffType, SEPARATOR_WIDTH_CLASS } from "@/app/diff/diff";

export default function DiffPair<T>(args: {
  tpe: DiffType,
  left: T | null,
  right: T | null,
  renderOne: (entry: T) => React.JSX.Element
}): React.JSX.Element {
  Assert(args.left !== null || args.right !== null, "Both left and right entries are null");

  return (
    <div className="flex min-h-[4rem]">
      <div className="w-[calc(50%-20px)] flex pr-4">
        <div className="w-full">
          {
            args.left &&
              <div className="flex justify-start h-full">
                  <div className="flex flex-row items-start max-w-full w-full">
                    {args.renderOne(args.left)}
                  </div>
              </div>
          }
        </div>
      </div>
      <div className={SEPARATOR_WIDTH_CLASS}></div>
      <div className="w-[calc(50%-20px)] flex pl-4">
        <div className="w-full">
          {
            args.right &&
              <div className="flex justify-end h-full">
                  <div className="flex flex-row items-start max-w-full w-full">
                    {args.renderOne(args.right)}
                  </div>
              </div>
          }
        </div>
      </div>
    </div>
  )
}
