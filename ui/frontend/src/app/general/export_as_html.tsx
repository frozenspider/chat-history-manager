import React from "react";

import { CombinedChat, GetChatPrettyName } from "@/app/utils/entity_utils";
import { ChatState, ChatStateCache, ChatStateCacheContext } from "@/app/utils/chat_state";
import { DatasetState, ServicesContext, GrpcServices } from "@/app/utils/state";

import MessagesList, { PreloadEverythingEvent } from "@/app/message/message_list";

import { writeTextFile } from "@tauri-apps/plugin-fs";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Listen } from "@/app/utils/utils";

import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { ScrollBar } from "@/components/ui/scroll-area";

// TODO: files
// TODO: some replies/images/other lazy elements are still being loaded and are replaced by throbbers
export async function ExportChatHtml(
  path: string,
  cc: CombinedChat,
  dsState: DatasetState,
  services: GrpcServices
): Promise<void> {
  let resolveCanContinue: () => void = () => {
  }
  let rejectCanContinue: (err: any) => void = (_err) => {
  }

  let canContinuePromise: Promise<void> =
    new Promise<void>((resolve, reject) => {
      resolveCanContinue = resolve
      rejectCanContinue = reject
    })

  let unlisten =
    Listen<{ error: null | any }>(PreloadEverythingEvent, (ev) => {
      let error = ev.payload.error
      if (error) {
        rejectCanContinue(error)
      } else {
        resolveCanContinue()
      }
    })

  let messagesList = <FullMessagesList cc={cc} dsState={dsState} services={services}/>
  const div = document.createElement('div');
  const root = createRoot(div);
  root.render(messagesList);

  await canContinuePromise

  flushSync(() => {
    root.render(messagesList)
  });

  let css = ExtractCss();

  let unlistenFn = await unlisten
  unlistenFn()

  let result =
    `<body>
      <head>
        <title>${GetChatPrettyName(cc.mainCwd.chat!)}</title>
        <style>
          ${css}
        </style>
      </head>
      <body>
        ${div.innerHTML}
      </body>
    </body>`

  await writeTextFile(path, result)
}

function FullMessagesList(args: {
  cc: CombinedChat,
  dsState: DatasetState,
  services: GrpcServices
}): React.JSX.Element {
  let [chatState, setChatState] = React.useState(new ChatState(args.cc, args.dsState))

  let chatStateCache = new ChatStateCache()

  return (
    <ServicesContext.Provider value={args.services}> <ChatStateCacheContext.Provider value={chatStateCache}>
      <ScrollAreaPrimitive.Root>
        <MessagesList chatState={chatState}
                      setChatState={setChatState}
                      setNavigationCallbacks={_cbs => {
                      }}
                      preloadEverything={true}/>
        <ScrollBar/>
        <ScrollAreaPrimitive.Corner/>
      </ScrollAreaPrimitive.Root>
    </ChatStateCacheContext.Provider> </ServicesContext.Provider>
  )
}

export default function ExtractCss(): string {
  return Array.from(document.styleSheets)
    .flatMap(s => Array.from(s.cssRules))
    .map(r => r.cssText || '')
    .join('\n');
}
