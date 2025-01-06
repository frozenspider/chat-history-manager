import React from "react";

import { cn } from "@/lib/utils";
import { EnsureDefined } from "@/app/utils/utils";
import { AbbreviatedArray, DiffData, DiffType, SEPARATOR_WIDTH_CLASS } from "@/app/diff/diff";

import DiffPair from "@/app/diff/diff_pair";
import { Checkbox } from "@/components/ui/checkbox";


const BG_COLORS: Map<DiffType, string> = new Map([
  ["no-change", "bg-white"],
  ["change", "bg-yellow-50"],
  ["add", "bg-green-50"],
  ["keep", "bg-white"],
//  ["remove", "bg-red-50"],
]);

// These colors could theoretically be set as background on entries themselves to make them stand out
// const ENTRY_COLORS: Map<DiffType, string> = new Map([
//   ["no-change", "bg-gray-100"],
//   ["change", "bg-yellow-100"],
//   ["add", "bg-green-100"],
//   ["remove", "bg-red-100"],
// ]);

export default function DiffSection<T>(args: {
  index: number,
  data: DiffData<T>,
  isSelected: boolean,
  isToggleable: boolean
  renderOne: (entry: T) => React.JSX.Element
  onToggle: () => void
}): React.JSX.Element {
  const renderDiffPairs = () => {
    const data = args.data;
    let key = 0;
    const elements: Array<React.JSX.Element> = [];

    function renderEntryPairs(leftArr: Array<T>, rightArr: Array<T>) {
      const maxLength = Math.max(leftArr.length, rightArr.length)
      for (let i = 0; i < maxLength; i++) {
        elements.push(
          <DiffPair key={"diff" + key++}
                    tpe={data.tpe}
                    left={leftArr[i] || null}
                    right={rightArr[i] || null}
                    renderOne={args.renderOne}/>
        )
      }
    }

    if (Array.isArray(data.left) && Array.isArray(data.right)) {
      renderEntryPairs(data.left, data.right)
    } else {
      let leftLeading = data.left instanceof AbbreviatedArray ? data.left.leading : []
      let rightLeading = data.right instanceof AbbreviatedArray ? data.right.leading : []
      renderEntryPairs(leftLeading, rightLeading)

      elements.push(<XMoreEntriesPair data={data}/>)

      let leftTrailing = data.left instanceof AbbreviatedArray ? data.left.trailing : []
      let rightTrailing = data.right instanceof AbbreviatedArray ? data.right.trailing : []
      renderEntryPairs(leftTrailing, rightTrailing)
    }

    return elements
  };

  return (
    <div className={cn(
      "relative flex p-4 border-b",
      EnsureDefined(BG_COLORS.get(args.data.tpe)),
      args.isToggleable && !args.isSelected ? "opacity-80" : ""
    )}>
      <div className="flex-grow">
        {renderDiffPairs()}
      </div>
      {args.isToggleable && (
        <>
          <div className={cn(
            SEPARATOR_WIDTH_CLASS,
            "absolute left-1/2 top-0 bottom-0 -ml-5 cursor-pointer hover:bg-gray-200 transition-colors"
          )}
               onClick={args.onToggle}
               role="button"
               aria-label={`Toggle diff section ${args.index + 1}`}
          />
          <div
            className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <Checkbox
              checked={args.isSelected}
              aria-hidden="true"
            />
          </div>
        </>
      )}
      {args.isSelected || (
        <div className="absolute inset-0 bg-gray-200 bg-opacity-20 pointer-events-none" aria-hidden="true"/>
      )}
    </div>
  );
}

function XMoreEntriesPair(args: { data: DiffData<any> }): React.JSX.Element {
  return (
    <div className="flex justify-between items-center my-8 relative">
      <div className="w-[calc(50%-20px)] flex justify-center relative">
        {args.data.left instanceof AbbreviatedArray && <>
            <ZigzagSVG/>
            <div className="px-4 py-2 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full shadow-sm relative z-10">
              <span className="text-sm font-medium text-gray-700">
                {args.data.left.inBetween} more
              </span>
            </div>
        </>}
      </div>
      <div className={SEPARATOR_WIDTH_CLASS}></div>
      <div className="w-[calc(50%-20px)] flex justify-center relative">
        {args.data.right instanceof AbbreviatedArray && <>
            <ZigzagSVG/>
            <div className="px-4 py-2 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full shadow-sm relative z-10">
              <span className="text-sm font-medium text-gray-700">
                {args.data.right.inBetween} more
              </span>
            </div>
        </>}
      </div>
    </div>
  )
}

const ZigzagSVG = () => (
  <svg className="absolute top-1/2 left-0 w-full h-4 -mt-2" preserveAspectRatio="none" viewBox="0 0 100 20" fill="none"
       xmlns="http://www.w3.org/2000/svg">
    <path
      d="M0 10L2 8L4 12L6 8L8 12L10 8L12 12L14 8L16 12L18 8L20 12L22 8L24 12L26 8L28 12L30 8L32 12L34 8L36 12L38 8L40 12L42 8L44 12L46 8L48 12L50 8L52 12L54 8L56 12L58 8L60 12L62 8L64 12L66 8L68 12L70 8L72 12L74 8L76 12L78 8L80 12L82 8L84 12L86 8L88 12L90 8L92 12L94 8L96 12L98 8L100 10"
      stroke="#CBD5E0" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
  </svg>
)
