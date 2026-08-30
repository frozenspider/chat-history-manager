'use client'

import React from "react";

import { DatasetState, LoadedFileState } from "@/app/utils/state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DatasetSelector from "@/app/dataset/dataset_selector";

export default function DatasetSelectorDialog(args: {
  openFiles: LoadedFileState[]
  isOpen: boolean
  title: string
  description: string
  leftLabel: string
  rightLabel: string
  onConfirm: (left: DatasetState, right: DatasetState) => void
  onClose: () => void
}) {
  return <>
    <Dialog open={args.isOpen} onOpenChange={(open) => open ? null : args.onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{args.title}</DialogTitle>
          <DialogDescription>{args.description}</DialogDescription>
        </DialogHeader>
        <DatasetSelector openFiles={args.openFiles}
                         leftLabel={args.leftLabel}
                         rightLabel={args.rightLabel}
                         onConfirm={args.onConfirm}/>
      </DialogContent>
    </Dialog>
  </>
}
