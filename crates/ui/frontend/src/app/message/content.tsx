'use client'

import React from "react";

import {
  Content,
  ContentAudio,
  ContentFile,
  ContentLocation,
  ContentPhoto,
  ContentPoll,
  ContentSharedContact,
  ContentSticker,
  ContentVideo,
  ContentVideoMsg,
  ContentVoiceMsg,
  User
} from "@/protobuf/core/protobuf/entities";

import { AssertUnreachable, GetNonDefaultOrNull } from "@/app/utils/utils";
import { ChatState } from "@/app/utils/chat_state";
import { GetUserPrettyName, NameColorClassFromPrettyName, Unnamed } from "@/app/utils/entity_utils";
import TauriImage from "@/app/general/tauri_image";
import AudioComponent from "@/app/message/audio_component";

import SystemMessage from "@/app/message/system_message";
import ColoredName from "@/app/message/colored_name";

export default function MessageContent(args: {
  content: Content | null,
  chatState: ChatState
}): React.JSX.Element | null {
  let sealed = GetNonDefaultOrNull(args.content?.sealedValueOptional)
  if (sealed === null) return null
  let dsRoot = args.chatState.dsState.dsRoot
  // TODO: Right-click -> Reveal in System Explorer
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
      return <MessageContentSharedContact content={sealed.sharedContact} chatMembers={args.chatState.cc.members}/>
    default:
      AssertUnreachable(sealed)
  }
}

export function MessageContentSticker(args: {
  content: ContentSticker,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.pathOption);

  let w = content.width / 2
  let h = content.height / 2

  if (path?.endsWith(".tgs")) {
    // Telegram-specific animated sticker, not supported
    return <>
      <SystemMessage>Animated sticker</SystemMessage>
      <TauriImage elementName="Sticker"
                  relativePathAsync={async () => GetNonDefaultOrNull(content.thumbnailPathOption)}
                  width={w}
                  height={h}
                  mimeType={null /* unknown */}
                  dsRoot={args.dsRoot}
                  additional={{
                    altText: content.emojiOption
                  }}/>
    </>
  } else if (path?.endsWith(".webm")) {
    return VideoComponent(
      "Animated sticker",
      GetNonDefaultOrNull(content.pathOption),
      GetNonDefaultOrNull(content.thumbnailPathOption),
      args.dsRoot,
      w,
      h,
      null
    )
  } else {
    return (
      <TauriImage elementName="Sticker"
                  relativePathAsync={async () => path}
                  dsRoot={args.dsRoot}
                  width={w}
                  height={h}
                  mimeType={null /* unknown */}
                  additional={{
                    altText: content.emojiOption
                  }}/>
    )
  }
}

export function MessageContentPhoto(args: {
  content: ContentPhoto,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let path = GetNonDefaultOrNull(content.pathOption);
  return (
    <TauriImage elementName={content.isOneTime ? "One-time photo" : "Photo"}
                relativePathAsync={async () => path}
                dsRoot={args.dsRoot}
                width={content.width}
                height={content.height}
                mimeType={null /* unknown */}/>
  )
}

export function MessageContentVoiceMsg(args: {
  content: ContentVoiceMsg,
  dsRoot: string
}): React.JSX.Element {
  return <AudioComponent elementName="Voice message"
                         relativePath={GetNonDefaultOrNull(args.content.pathOption)}
                         dsRoot={args.dsRoot}
                         mimeType={GetNonDefaultOrNull(args.content.mimeType)}
                         duration={GetNonDefaultOrNull(args.content.durationSecOption)}/>
}

export function MessageContentAudio(args: {
  content: ContentAudio,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let audio =
    <AudioComponent elementName="Audio"
                    relativePath={GetNonDefaultOrNull(content.pathOption)}
                    dsRoot={args.dsRoot}
                    mimeType={GetNonDefaultOrNull(content.mimeType)}
                    duration={GetNonDefaultOrNull(args.content.durationSecOption)}/>

  let title =
    GetNonDefaultOrNull([content.performerOption, content.titleOption]
      .map(GetNonDefaultOrNull)
      .filter(x => x)
      .join(" - "))
  return <>
    {title && <blockquote><i>Audio:</i> <b>{title}</b></blockquote>}
    {audio}
  </>
}

export function MessageContentVideoMsg(args: {
  content: ContentVideoMsg,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  return VideoComponent(
    content.isOneTime ? "One-time video message" : "Video message",
    GetNonDefaultOrNull(content.pathOption),
    GetNonDefaultOrNull(content.thumbnailPathOption),
    args.dsRoot,
    content.width,
    content.height,
    GetNonDefaultOrNull(content.mimeType)
  )
}

export function MessageContentVideo(args: {
  content: ContentVideo,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let video = VideoComponent(
    content.isOneTime ? "One-time video" : "Video",
    GetNonDefaultOrNull(content.pathOption),
    GetNonDefaultOrNull(content.thumbnailPathOption),
    args.dsRoot,
    content.width,
    content.height,
    GetNonDefaultOrNull(content.mimeType)
  )
  let title =
    GetNonDefaultOrNull([content.performerOption, content.titleOption]
      .map(GetNonDefaultOrNull)
      .filter(x => x)
      .join(" - "))
  return <>
    {title && <blockquote><i>Video:</i> <b>{title}</b></blockquote>}
    {video}
  </>
}

function VideoComponent(
  elementName: string,
  _relativeFilePath: string | null,
  relativeThumbnailPath: string | null,
  dsRoot: string,
  width: number,
  height: number,
  _mimeType: string | null
): React.JSX.Element {
  // TODO: Implement video playback, someday
  return (
    <TauriImage elementName={elementName + " thumbnail"}
                relativePathAsync={async () => relativeThumbnailPath}
                dsRoot={dsRoot}
                width={width}
                height={height}
                mimeType={null /* thumbnail mime unknown */}
                additional={{
                  altText: elementName + " thumbnail"
                }}/>
  )
}

export function MessageContentFile(args: {
  content: ContentFile,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content
  let thumbnailPath = GetNonDefaultOrNull(content.thumbnailPathOption);

  let header = <blockquote><i>File:</i> <b>{content.fileNameOption || Unnamed}</b></blockquote>
  if (thumbnailPath) {
    return (
      <>
        {header}
        <TauriImage elementName={"File thumbnail"}
                    relativePathAsync={async () => thumbnailPath}
                    dsRoot={args.dsRoot}
                    width={0 /* unknown */}
                    height={0 /* unknown */}
                    mimeType={null /* unknown */}/>
      </>
    )
  } else {
    return (
      header
    )
  }
}

export function MessageContentLocation(args: {
  content: ContentLocation,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content

  return (
    <blockquote>
      {GetNonDefaultOrNull(content.titleOption) && <p><b>{content.titleOption}</b></p>}
      {GetNonDefaultOrNull(content.addressOption) && <p>{content.addressOption}</p>}
      <p><i>Location:</i> <b>{content.latStr}, {content.lonStr}</b></p>
      {GetNonDefaultOrNull(content.durationSecOption) && <p>(live for {content.durationSecOption} s)</p>}
    </blockquote>
  )
}

export function MessageContentPoll(args: {
  content: ContentPoll,
  dsRoot: string
}): React.JSX.Element {
  let content = args.content

  return (
    <blockquote>
      <i>Poll:</i> {content.question}
    </blockquote>
  )
}

export function MessageContentSharedContact(args: {
  content: ContentSharedContact,
  chatMembers: User[]
}): React.JSX.Element {
  let content = args.content

  let contactPrettyName = GetUserPrettyName(content)
  let colorClass = NameColorClassFromPrettyName(contactPrettyName, args.chatMembers).text

  return (
    <blockquote>
      <SystemMessage>Shared contact</SystemMessage>
      <ColoredName name={contactPrettyName} colorClass={colorClass}/>&nbsp;
      ({content.phoneNumberOption ? "phone: " + content.phoneNumberOption : "no phone number"})
    </blockquote>
  )
}
