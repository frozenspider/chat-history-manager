'use client'

import React from "react";

import { ContentVoiceMsg } from "@/protobuf/core/protobuf/entities";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import LazyContent, { LazyDataState } from "@/app/utils/lazy_content";
import MessagesLoadSpinner from "@/app/utils/load_spinner";
import { TestMp3Base64Data } from "@/app/utils/test_entities";
import SystemMessage from "@/app/message/system_message";

export default function MessageContentVoiceMsg(args: {
  content: ContentVoiceMsg,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.pathOption)
  let mimeType = GetNonDefaultOrNull(content.mimeType)

  if (!mimeType) {
    // Handling some basic MIME types
    if (path?.endsWith(".ogg"))
      mimeType = "audio/ogg"
    else if (path?.endsWith(".mp3"))
      mimeType = "audio/mpeg"
    else if (path?.endsWith(".wav"))
      mimeType = "audio/wav"
    else
      mimeType = "audio/mp3"
  }

  return LazyContent(
    "Voice message",
    path,
    args.dsRoot,
    mimeType,
    (lazyData) => {
      if (lazyData.state == LazyDataState.Failure) {
        return <SystemMessage>Voice message loading failed</SystemMessage>
      } else if (lazyData.data || lazyData.state == LazyDataState.TauriNotAvailable) {
        let data = lazyData.data
        if (lazyData.state == LazyDataState.TauriNotAvailable) {
          // If not using Tauri, use test data
          data = TestMp3Base64Data
        }
        // TODO: Doesn't work in Tauri window!
        return (
          <audio className="block w-full max-w-md mr-auto" controls>
            <source src={data!}/>
          </audio>
        )
      } else {
        return <MessagesLoadSpinner center={false} text="Voice message loading..."/>
      }
    }
  )
}
