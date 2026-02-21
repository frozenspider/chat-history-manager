'use client'

import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'

export interface CalendarPickerProps {
  isOpen: boolean
  onClose: () => void
  onDateSelect?: (date: Date) => void
  position: { top: number; left: number }
  fromDate?: Date
  toDate?: Date
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
      >
        <Calendar
          mode="single"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
          selected={selectedDate}
          onSelect={handleDateSelect}
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          fromDate={fromDate}
          toDate={toDate}
          captionLayout="dropdown"
          className="rounded-lg border"
          initialFocus
        />
      </div>
    </>
  )
}
