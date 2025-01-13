import React from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import DiffSection from "@/app/diff/diff_section";
import { Assert } from "@/app/utils/utils";
import { Button } from "@/components/ui/button";
import { CheckSquare, Square } from "lucide-react";


export const SEPARATOR_WIDTH_CLASS = "w-10";

export type DiffType = "no-change" | "change" | "add" | "dont-add" | "keep"
export type DiffUnits<T> = Array<T> | AbbreviatedArray<T>

/**
 * Left and right:
 * - `"no-change" | "change"`: guaranteed to be of the same size and type
 * - `"add" | "dont-add"`: left is empty
 * - `"keep"`: right is empty
 *
 * We sure could encode it into a type system, but that seems like too much work
 */
export interface DiffData<T> {
  tpe: DiffType
  left: DiffUnits<T>
  right: DiffUnits<T>
}

export class AbbreviatedArray<T> {
  leading: Array<T>
  inBetween: number
  trailing: Array<T>

  constructor(leading: Array<T>, inBetween: number, trailing: Array<T>) {
    Assert(inBetween > 0);
    Assert(leading.length > 0);
    Assert(trailing.length > 0);

    this.leading = leading;
    this.inBetween = inBetween;
    this.trailing = trailing;
  }
}

export default function Diff<T>(args: {
  description: string,
  labels: [string, string],
  diffsData: Array<DiffData<T>>,
  isToggleable: (row: DiffData<T>) => boolean
  renderOne: (entry: T) => React.JSX.Element
  setToggleableSelection: (selectableIndexes: Set<number>) => void
}): React.JSX.Element {
  const allSelectableSections = React.useMemo(() =>
      new Set(args.diffsData
        .map((d, idx) => args.isToggleable(d) ? idx : -1)
        .filter(idx => idx !== -1)),
    [args.diffsData, args.isToggleable]
  )

  // Selected sections should only include toggleable sections
  let [selectedSections, setSelectedSections] =
    React.useState<Set<number>>(new Set(allSelectableSections));

  React.useEffect(() => {
    args.setToggleableSelection(selectedSections);
  }, [selectedSections])

  const toggleSection = (index: number) => {
    setSelectedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const toggleAllSections = () => {
    setSelectedSections(prev =>
      prev.size === allSelectableSections.size ? new Set() : new Set(allSelectableSections)
    );
  };

  return <>
    {args.description && <p className="text-center text-gray-600 mb-2">
      {args.description}
    </p>}
    <div className="h-[calc(100vh-4rem)] flex flex-col border rounded-lg overflow-hidden">
      <div className="flex bg-gray-100 p-2 text-center">
        <div className="w-[calc(50%-60px)] font-semibold">{args.labels[0]}</div>
        <div className="w-40 flex justify-center">
          <Button variant="outline"
                  size="sm"
                  onClick={toggleAllSections}
                  className="h-10 flex items-center justify-center gap-2 bg-white hover:bg-gray-100"
                  style={{ width: "7.5rem" /* There is no w-30 class */ }}>
            {selectedSections.size == allSelectableSections.size ?
              <CheckSquare className="h-4 w-4"/> :
              <Square className="h-4 w-4"/>}
            <span className="font-medium">{selectedSections.size}/{allSelectableSections.size}</span>
          </Button>
        </div>
        <div className="w-[calc(50%-60px)] font-semibold">{args.labels[1]}</div>
      </div>
      <ScrollArea className="flex-1">
        {args.diffsData.map((diffData, index) => {
          const toggleable = args.isToggleable(diffData);
          return <DiffSection
            key={index}
            index={index}
            data={diffData}
            isSelected={!toggleable || selectedSections.has(index)}
            isToggleable={toggleable}
            renderOne={args.renderOne}
            onToggle={() => toggleable ? toggleSection(index) : null}
          />
        })}
      </ScrollArea>
    </div>
  </>
}
