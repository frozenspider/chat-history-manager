'use client'

import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'

export interface CalendarPickerProps {
  isOpen: boolean
  onClose: () => void
  onDateSelect?: (date: Date) => void
  position: { top: number; left: number }
  fromDate: Date
  toDate: Date
}

export function CalendarPicker({
  isOpen,
  onClose,
  onDateSelect,
  position,
  fromDate,
  toDate,
}: CalendarPickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [displayMonth, setDisplayMonth] = useState(toDate ?? new Date())

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date)
    if (date) {
      onDateSelect?.(date)
      onClose()
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      <div
        className="fixed z-50 rounded-lg border bg-card p-4 shadow-lg"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          hidden={{
            before: fromDate,
            after: toDate
          }}
          captionLayout="dropdown"
          autoFocus={true}
        />
        <div className="flex gap-2 border-t pt-3 mt-3">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!fromDate}
            onClick={() => {
              if (fromDate) {
                handleDateSelect(fromDate)
                setDisplayMonth(fromDate)
              }
            }}
          >
            Start
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              const today = new Date()
              handleDateSelect(today)
              setDisplayMonth(today)
            }}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!toDate}
            onClick={() => {
              if (toDate) {
                handleDateSelect(toDate)
                setDisplayMonth(toDate)
              }
            }}
          >
            End
          </Button>
        </div>
      </div>
    </>
  )
}
