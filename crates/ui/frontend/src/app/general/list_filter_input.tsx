'use client'

import React from "react";
import { Input } from "@/components/ui/input";

export default function ListFilterInput<T>(args: {
  entities: T[]
  filter: (e: T, searchTerm: string) => boolean
  searchBarText: string
  onChange: (filtered: [number, T][]) => void,
  className?: string
}) {
  let [filterTerm, setFilterTerm] =
    React.useState("")

  const indexedEntities = React.useMemo(() => {
    return Array.from(args.entities.entries())
  }, [args.entities])

  const onFilterTermChange = React.useCallback((filterTerm: string) => {
    setFilterTerm(filterTerm)

    const filtered =
      indexedEntities.filter(([_idx, e]) => args.filter(e, filterTerm))

    args.onChange(filtered)
  }, [indexedEntities])

  React.useEffect(() => {
    onFilterTermChange(filterTerm)
  }, [args.entities, onFilterTermChange])

  return <>
    <Input type="text"
           placeholder={args.searchBarText}
           value={filterTerm}
           onChange={(e) => onFilterTermChange(e.target.value)}
           className={args.className}/>
  </>
}
