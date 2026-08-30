'use client'

import React from "react";

import { DatasetState, LoadedFileState } from "@/app/utils/state";
import DatasetSelectorDialog from "@/app/dataset/dataset_selector_dialog";
import { AppEvent } from "@/app/utils/utils";


// Can't define it in popup_merge_datasets/page.tsx because of a Next.js bug
export const DatasetsMergedEvent: AppEvent = "datasets-merged" as AppEvent

export default function SelectDatasetsToMergeDialog(args: {
  openFiles: LoadedFileState[],
  isOpen: boolean
  onConfirm: (left: DatasetState, right: DatasetState) => void,
  onClose: () => void,
}) {
  return <>
    <DatasetSelectorDialog openFiles={args.openFiles}
                           isOpen={args.isOpen}
                           title="Merge datasets"
                           description="Select datasets to merge"
                           leftLabel="Base dataset"
                           rightLabel="Dataset to be merged in"
                           onConfirm={args.onConfirm}
                           onClose={args.onClose}/>
  </>
}
