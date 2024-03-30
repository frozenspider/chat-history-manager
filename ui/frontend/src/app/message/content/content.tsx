'use client'

import React from "react";

import { Content } from "@/protobuf/core/protobuf/entities";
import MessageContentPhoto from "@/app/message/content/content_photo";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function MessageContent(args: {
  content: Content | null,
  fileKey: string
}): React.JSX.Element | null {
  // FIXME: Other types
  //    | { $case: "sticker"; sticker: ContentSticker }
  //     | { $case: "photo"; photo: ContentPhoto }
  //     | { $case: "voice_msg"; voice_msg: ContentVoiceMsg }
  //     | { $case: "audio"; audio: ContentAudio }
  //     | { $case: "video_msg"; video_msg: ContentVideoMsg }
  //     | { $case: "video"; video: ContentVideo }
  //     | { $case: "file"; file: ContentFile }
  //     | { $case: "location"; location: ContentLocation }
  //     | { $case: "poll"; poll: ContentPoll }
  //     | { $case: "shared_contact"; shared_contact: ContentSharedContact }
  let sealed = GetNonDefaultOrNull(args.content?.sealedValueOptional)
  if (sealed === null) return null
  switch (sealed?.$case) {
    case "photo":
      return <MessageContentPhoto content={sealed.photo} fileKey={args.fileKey}/>
    default:
      throw new Error("Unknown content type " + JSON.stringify(sealed));
  }
}
