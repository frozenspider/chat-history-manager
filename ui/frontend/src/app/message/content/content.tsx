'use client'

import React from "react";

import { Content } from "@/protobuf/core/protobuf/entities";
import MessageContentPhoto from "@/app/message/content/content_photo";
import { AssertUnreachable, GetNonDefaultOrNull } from "@/app/utils/utils";
import { CurrentChatState } from "@/app/utils/state";
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
  state: CurrentChatState
}): React.JSX.Element | null {
  let sealed = GetNonDefaultOrNull(args.content?.sealedValueOptional)
  if (sealed === null) return null
  switch (sealed?.$case) {
    case "sticker":
      return <MessageContentSticker content={sealed.sticker} dsRoot={args.state.dsState.dsRoot}/>
    case "photo":
      return <MessageContentPhoto content={sealed.photo} dsRoot={args.state.dsState.dsRoot}/>
    case "voiceMsg":
      return <MessageContentVoiceMsg content={sealed.voiceMsg} dsRoot={args.state.dsState.dsRoot}/>
    case "audio":
      return <MessageContentAudio content={sealed.audio} dsRoot={args.state.dsState.dsRoot}/>
    case "videoMsg":
      return <MessageContentVideoMsg content={sealed.videoMsg} dsRoot={args.state.dsState.dsRoot}/>
    case "video":
      return <MessageContentVideo content={sealed.video} dsRoot={args.state.dsState.dsRoot}/>
    case "file":
      return <MessageContentFile content={sealed.file} dsRoot={args.state.dsState.dsRoot}/>
    case "location":
      return <MessageContentLocation content={sealed.location} dsRoot={args.state.dsState.dsRoot}/>
    case "poll":
      return <MessageContentPoll content={sealed.poll} dsRoot={args.state.dsState.dsRoot}/>
    case "sharedContact":
      return <MessageContentSharedContact content={sealed.sharedContact} dsRoot={args.state.dsState.dsRoot}/>
    default:
      AssertUnreachable(sealed)
  }
}
