'use client'

import React from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  render: (idx: number, e: T, isSelected: boolean, onClick: () => void) => React.ReactNode
}) {
  let [searchTerm, setSearchTerm] =
    React.useState("")

  let [selected, setSelected] =
    React.useState<[number, T] | null>(null)

  const indexedEntities = React.useMemo(() => {
    return Array.from(args.entities.entries())
  }, [args.entities])

  const filtered = React.useMemo(() => {
    return indexedEntities.filter(([_idx, e]) => args.filter(e, searchTerm))
  }, [indexedEntities, searchTerm])

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

      <Input type="text"
             placeholder={args.searchBarText}
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="mb-4"/>

      <ScrollArea className="flex-grow h-[calc(100vh-200px)] border rounded-md">
        <div className="p-1">
          {filtered.map(([idx, e]) =>
            args.render(idx, e, selected != null && idx == selected[0], () => handleSelect(idx, e)))}
        </div>
      </ScrollArea>

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
