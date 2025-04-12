'use client'

import React from "react"

import { DatasetState, LoadedFileState } from "@/app/utils/state";
import { EnsureDefined, SerializeJson } from "@/app/utils/utils";
import { PbUuid } from "@/protobuf/core/protobuf/entities";
import { FileKey } from "@/app/utils/entity_utils";

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"


type Side = "left" | "right"

export default function DatasetComparisonSelector(args: {
  openFiles: LoadedFileState[],
  leftLabel: string,
  rightLabel: string,
  onConfirm: (left: DatasetState, right: DatasetState) => void
}) {
  const [selectedDataset, setSelectedDataset] =
    React.useState<Record<Side, DatasetState | null>>({ left: null, right: null })

  const handleDatasetSelect = (side: Side, json: string) => {
    let [fileKey, dsUuid] = JSON.parse(json)
    let file = EnsureDefined(args.openFiles.find(f => f.key === fileKey))
    let ds = EnsureDefined(file.datasets.find(d => d.ds.uuid?.value === dsUuid))
    setSelectedDataset(prev => {
      if (side === "left" && prev.right?.fileKey === fileKey && prev.right?.ds?.uuid?.value === dsUuid) {
        // If the newly selected left dataset matches the right, deselect the right
        return { ...prev, left: ds, right: null }
      }
      return { ...prev, [side]: ds }
    })
  }

  const handleConfirm = () => {
    if (selectedDataset.left && selectedDataset.right) {
      args.onConfirm(selectedDataset.left, selectedDataset.right)
    }
  }

  const renderSelector = (side: Side) => (
    <Card className="flex-1">
      <CardContent>
        <h3 className="text-lg font-semibold mb-2">
          {side === "left" ? args.leftLabel : args.rightLabel}
        </h3>
        <ScrollArea className="h-[300px] pr-4">
          <RadioGroup
            value={selectedDataset[side] ?
              ToValue(selectedDataset[side].fileKey, selectedDataset[side].ds.uuid!) :
              ToValue("", { value: "" })}
            onValueChange={(value) => handleDatasetSelect(side, value)}
          >
            {args.openFiles.map((file) => (
              <div key={file.name} className="mb-4">
                <h4 className="text-md font-semibold mb-2 break-words">{file.name}</h4>
                {file.datasets.map((dataset) => (
                  <div key={ToValue(file.key, dataset.ds.uuid!)} className="flex items-start space-x-2 mb-2">
                    <RadioGroupItem value={ToValue(file.key, dataset.ds.uuid!)}
                                    id={`${side}-${dataset.ds.uuid!.value}`}
                                    className="mt-1"
                                    disabled={side === "right" && selectedDataset.left === dataset}/>
                    <Label htmlFor={`${side}-${dataset.ds.uuid!.value}`}
                           className={`text-sm leading-tight break-words ${
                             side === "right" && selectedDataset.left === dataset ? "text-gray-400" : ""
                           }`}>
                      <p>{dataset.ds.alias}</p>
                      <p>({dataset.ds.uuid?.value})</p>
                    </Label>
                  </div>
                ))}
              </div>
            ))}
          </RadioGroup>
        </ScrollArea>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        {renderSelector("left")}
        {renderSelector("right")}
      </div>
      <div className="flex justify-center">
        <Button
          onClick={handleConfirm}
          disabled={!selectedDataset.left || !selectedDataset.right}
        >
          Confirm Selection
        </Button>
      </div>
    </div>
  )
}

function ToValue(fileKey: FileKey, dsUuid: PbUuid): string {
  return SerializeJson([fileKey, dsUuid.value])
}
