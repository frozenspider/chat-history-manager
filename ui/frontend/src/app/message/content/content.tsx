'use client'

import React from "react";

import { Content } from "@/protobuf/core/protobuf/entities";
import MessageContentPhoto from "@/app/message/content/content_photo";

export default function MessageContent(args: {
  content: Content | null,
  dsRoot: string
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
  switch (args.content?.sealed_value_optional?.$case) {
    case null:
      return null;
    case "photo":
      return <MessageContentPhoto content={args.content.sealed_value_optional.photo} dsRoot={args.dsRoot}/>
    default:
      throw new Error("Unknown content type " + JSON.stringify(args.content));
  }
}
