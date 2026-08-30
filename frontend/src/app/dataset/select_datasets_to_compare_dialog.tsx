'use client'

import React from "react";

import { DatasetState, LoadedFileState } from "@/app/utils/state";
import DatasetSelectorDialog from "@/app/dataset/dataset_selector_dialog";

export default function SelectDatasetsToCompareDialog(args: {
  openFiles: LoadedFileState[],
  isOpen: boolean
  onConfirm: (left: DatasetState, right: DatasetState) => void,
  onClose: () => void,
}) {
  return <>
    <DatasetSelectorDialog openFiles={args.openFiles}
                           isOpen={args.isOpen}
                           title="Compare datasets"
                           description="Select datasets to compare"
                           leftLabel="Left dataset"
                           rightLabel="Right dataset"
                           onConfirm={args.onConfirm}
                           onClose={args.onClose}/>
  </>
}
