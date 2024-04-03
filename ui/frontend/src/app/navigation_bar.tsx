'use client'

import React from "react";

import 'react-day-picker/dist/style.css';

import {
  ArrowDownToLineIcon,
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  ArrowUpToLineIcon,
  CalendarDaysIcon,
  CalendarIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ChatState, ServicesContext } from "@/app/utils/state";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function NavigationBar(args: {
  chatState: ChatState | null,
}) {

  let services = React.useContext(ServicesContext)!

  let [navEnabled, setNavEnabled] =
    React.useState(false)
  let [dateLimits, setDateLimits] =
    React.useState<[Date, Date]>([new Date(0), new Date()])

  // Asynchronously fetch start/end date for calendar
  React.useEffect(() => {
    async function inner() {
      // To minimize dependencies
      let fileKey = args.chatState?.dsState?.fileKey
      let chat = args.chatState?.cwd?.chat
      if (!chat || !fileKey) {
        setNavEnabled(false)
        return
      }

      let first = (await services.daoClient.scrollMessages({
        key: fileKey,
        chat: chat,
        offset: BigInt(0),
        limit: BigInt(1)
      })).messages

      let last = (await services.daoClient.lastMessages({
        key: fileKey,
        chat: chat,
        limit: BigInt(1)
      })).messages

      if (first.length > 0 && last.length > 0) {
        setNavEnabled(true)
        setDateLimits([
          new Date(Number(first[0].timestamp) * 1000),
          new Date(Number(last[0].timestamp) * 1000)
        ])
      } else {
        setNavEnabled(false)
      }
    }

    inner().catch((e) => {
      setNavEnabled(false)
      console.error("Failed to fetch date limits", e)
    })
  }, [
    args.chatState?.dsState.fileKey,
    args.chatState?.dsState.ds.uuid?.value,
    args.chatState?.cwd.chat,
    services.daoClient
  ])

  // See https://github.com/shadcn-ui/ui/issues/546#issuecomment-1873947429
  let calendarClassNames = {
    caption_label: 'flex items-center text-sm font-medium',
    dropdown: 'rdp-dropdown bg-card',
    dropdown_icon: 'ml-2',
    dropdown_year: 'rdp-dropdown_year ml-3',
    button: '',
    button_reset: '',
  }
  return <>
    <header className="sticky top-0 bg-white dark:bg-gray-900 z-10">
      <TooltipProvider delayDuration={0}>
        <div className="container mx-auto flex items-center justify-between p-4">
          <div className="flex items-center space-x-2 text-xs">

            <Tooltip>
              <Button size="icon" variant="ghost" disabled={!navEnabled} asChild>
                <TooltipTrigger>
                  <ArrowUpToLineIcon className="h-4 w-4"/>
                </TooltipTrigger>
              </Button>
              <TooltipContent>
                <span>To the beginning of history</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <Button size="icon" variant="ghost" disabled={!navEnabled} asChild>
                <TooltipTrigger>
                  <ArrowDownToLineIcon className="h-4 w-4"/>
                </TooltipTrigger>
              </Button>
              <TooltipContent>
                <span>To the end of history</span>
              </TooltipContent>
            </Tooltip>

            <Separator className="mx-2 h-6" orientation="vertical"/>

            <Tooltip>
              <Popover>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" disabled={!navEnabled}>
                      <CalendarIcon className="h-4 w-4"/>
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar classNames={calendarClassNames}
                            initialFocus
                            fromDate={dateLimits[0]}
                            toDate={dateLimits[1]}
                            captionLayout="dropdown-buttons"/>
                </PopoverContent>
              </Popover>
              <TooltipContent>
                <span>To the specific date</span>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center space-x-4">
            <Button className="rounded-full" variant="outline">
              <ArrowLeftToLineIcon className="h-4 w-4"/>
              Previous
            </Button>
            <Button className="rounded-full" variant="outline">
              Next
              <ArrowRightToLineIcon className="h-4 w-4"/>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button className="rounded-full" variant="outline">
                  <CalendarDaysIcon className="h-4 w-4 -translate-x-1 mr-1"/>
                  Pick a date
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar classNames={calendarClassNames}
                          initialFocus
                          mode="single"
                          fromDate={dateLimits[0]}
                          toDate={dateLimits[1]}
                          numberOfMonths={2}
                          captionLayout="dropdown-buttons"/>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </TooltipProvider>
    </header>
  </>
}
