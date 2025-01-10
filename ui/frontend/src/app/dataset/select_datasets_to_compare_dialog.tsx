'use client'

import React from "react";

import { DatasetState, GetServices, LoadedFileState } from "@/app/utils/state";
import DatasetSelectorDialog from "@/app/dataset/dataset_selector_dialog";

export default function SelectDatasetsToCompareDialog(args: {
  openFiles: LoadedFileState[],
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void,
  onConfirm: (left: DatasetState, right: DatasetState) => void
}) {
  let handleConfirm =
    React.useCallback((left: DatasetState, right: DatasetState) => {
      args.onConfirm(left, right)
      args.setIsOpen(false)
    }, [args.onConfirm, args.setIsOpen])

  return <>
    <DatasetSelectorDialog openFiles={args.openFiles}
                           isOpen={args.isOpen}
                           setIsOpen={args.setIsOpen}
                           title="Compare datasets"
                           description="Select datasets to compare"
                           leftLabel="Left dataset"
                           rightLabel="Right dataset"
                           onConfirm={handleConfirm}/>
  </>
}
