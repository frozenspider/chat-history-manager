'use client'

import React from "react";

import { Content } from "@/protobuf/core/protobuf/entities";
import MessageContentPhoto from "@/app/message/content/content_photo";
import { AssertUnreachable, GetNonDefaultOrNull } from "@/app/utils/utils";
import { ChatState } from "@/app/utils/state";
import MessageContentSticker from "@/app/message/content/content_sticker";
import MessageContentVoiceMsg from "@/app/message/content/content_voice";
import MessageContentVideo from "@/app/message/content/content_video";
import MessageContentAudio from "@/app/message/content/content_audio";
import MessageContentVideoMsg from "@/app/message/content/content_video_msg";
import MessageContentFile from "@/app/message/content/content_file";
import MessageContentLocation from "@/app/message/content/content_location";
import MessageContentPoll from "@/app/message/content/content_poll";
import MessageContentSharedContact from "@/app/message/content/content_shared_contact";

export default function MessageContent(args: {
  content: Content | null,
  chatState: ChatState
}): React.JSX.Element | null {
  let sealed = GetNonDefaultOrNull(args.content?.sealedValueOptional)
  if (sealed === null) return null
  let dsRoot = args.chatState.dsState.dsRoot
  switch (sealed?.$case) {
    case "sticker":
      return <MessageContentSticker content={sealed.sticker} dsRoot={dsRoot}/>
    case "photo":
      return <MessageContentPhoto content={sealed.photo} dsRoot={dsRoot}/>
    case "voiceMsg":
      return <MessageContentVoiceMsg content={sealed.voiceMsg} dsRoot={dsRoot}/>
    case "audio":
      return <MessageContentAudio content={sealed.audio} dsRoot={dsRoot}/>
    case "videoMsg":
      return <MessageContentVideoMsg content={sealed.videoMsg} dsRoot={dsRoot}/>
    case "video":
      return <MessageContentVideo content={sealed.video} dsRoot={dsRoot}/>
    case "file":
      return <MessageContentFile content={sealed.file} dsRoot={dsRoot}/>
    case "location":
      return <MessageContentLocation content={sealed.location} dsRoot={dsRoot}/>
    case "poll":
      return <MessageContentPoll content={sealed.poll} dsRoot={dsRoot}/>
    case "sharedContact":
      return <MessageContentSharedContact content={sealed.sharedContact} chatMembers={args.chatState.cwd.members}/>
    default:
      AssertUnreachable(sealed)
  }
}
