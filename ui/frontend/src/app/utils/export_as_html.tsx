import React from "react";

import { CombinedChat } from "@/app/utils/entity_utils";
import { ChatState, ChatStateCache, ChatStateCacheContext } from "@/app/utils/chat_state";
import { DatasetState, NavigationCallbacks, ServicesContext, ServicesContextType } from "@/app/utils/state";

import MessagesList, { PreloadEverythingEventName } from "@/app/message/message_list";

import { writeTextFile } from "@tauri-apps/plugin-fs";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Listen } from "@/app/utils/utils";

import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { ScrollBar } from "@/components/ui/scroll-area";

// TODO: styles
// TODO: files
// TODO: some images are still being loaded and are replaced by throbbers
export async function ExportChatHtml(
  path: string,
  cc: CombinedChat,
  dsState: DatasetState,
  services: ServicesContextType
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
    Listen<{ error: null | any }>(PreloadEverythingEventName, (ev) => {
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

  let unlistenFn = await unlisten
  unlistenFn()

  await writeTextFile(path, div.innerHTML)
}

function FullMessagesList(args: {
  cc: CombinedChat,
  dsState: DatasetState,
  services: ServicesContextType
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
