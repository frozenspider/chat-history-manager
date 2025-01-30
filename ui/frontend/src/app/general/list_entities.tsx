'use client'

import React from "react";
import ListFilterInput from "@/app/general/list_filter_input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function ListEntities<T>(args: {
  entities: T[]
  filter: (e: T, searchTerm: string) => boolean
  isDangerous: boolean
  description: string | null
  searchBarText: string
  selectButton: {
    text: string
    action: (e: T) => void
  } | null
  render: (es: [number, T][], isSelected: (idx: number) => boolean, onClick: (idx: number, e: T) => void) => React.ReactNode
}) {

  let [selected, setSelected] =
    React.useState<[number, T] | null>(null)

  let [filtered, setFiltered] =
    React.useState<[number, T][]>([])

  const handleSelect = React.useCallback((idx: number, e: T) => {
    if (!selected || selected[0] !== idx) {
      setSelected([idx, e])
    } else {
      setSelected(null)
    }
  }, [selected])

  return <>
    <div className="w-full mx-auto p-6 md:p-10 flex flex-col h-screen">
      {args.description &&
          <Alert variant="default" className="mb-4">
            {args.isDangerous && <AlertTriangle className="h-4 w-4"/>}
              <AlertDescription>{
                args.description
                  .split("\n")
                  .map((line, idx) =>
                    <p key={idx}>{line.trim()}</p>
                  )
              }</AlertDescription>
          </Alert>}

      <ListFilterInput entities={args.entities}
                       filter={args.filter}
                       searchBarText={args.searchBarText}
                       onChange={filtered => setFiltered(filtered)}
                       className="mb-4"/>

      {args.render(
        filtered,
        (idx) => selected != null && idx == selected[0],
        handleSelect
      )}

      {args.selectButton &&
          <Button variant={args.isDangerous ? "destructive" : "default"}
                  className="mt-4"
                  onClick={() => args.selectButton!.action(selected![1])}
                  disabled={!selected}>
            {args.selectButton.text}
          </Button>}
    </div>
  </>
}
