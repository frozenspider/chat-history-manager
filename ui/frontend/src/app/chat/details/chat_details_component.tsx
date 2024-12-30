import React from "react";

import {
  ChatSourceTypeToString,
  ChatTypeToString,
  CombinedChat,
  GetChatPrettyName,
  IdToReadable
} from "@/app/utils/entity_utils";
import { ChatType } from "@/protobuf/core/protobuf/entities";
import { DatasetState } from "@/app/utils/state";
import TauriImage from "@/app/utils/tauri_image";
import { GetNonDefaultOrNull } from "@/app/utils/utils";

export default function ChatDetailsComponent(args: {
  cc: CombinedChat,
  dsState: DatasetState
}): React.JSX.Element {
  const [windowDimensions, setWindowDimensions] =
    React.useState<WindowDimensions>(getWindowDimensions());

  let mainChat = args.cc.mainCwd.chat!

  let imgs = [GetNonDefaultOrNull(mainChat.imgPathOption)]
  if (mainChat.tpe === ChatType.PERSONAL) {
    let interlocutor = args.cc.members.find(m => m.id !== args.dsState.myselfId)
    if (interlocutor) {
      for (let pp of interlocutor.profilePictures) {
        imgs.push(GetNonDefaultOrNull(pp.path))
      }
    }
  }
  imgs = imgs.filter(i => i)

  React.useEffect(() => {
    function handleResize() {
      setWindowDimensions(getWindowDimensions());
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // TODO: Show all images
  // TODO: Make chat ID clickable to edit?

  return <>
    <div className="flex flex-col gap-2.5 p-5">

      <div style={{ width: "100%" }}>
        <TauriImage elementName={"Image"}
                    relativePath={GetNonDefaultOrNull(imgs[0])}
                    dsRoot={args.dsState.dsRoot}
                    width={0}
                    height={0}
                    mimeType={null /* unknown */}
                    additional={{
                      maxWidth: windowDimensions.width - 100,
                      maxHeight: 400,
                      keepPlaceholderOnNull: true
                    }}/>
      </div>

      <Row uniqId="chat-name" label="Chat Name" value={GetChatPrettyName(mainChat)}/>
      <Row uniqId="chat-id" label="Chat ID" value={IdToReadable(mainChat.id)}/>
      <Row uniqId="chat-type" label="Type" value={ChatTypeToString(mainChat.tpe)}/>
      <Row uniqId="msgs" label="# Messages" value={mainChat.msgCount.toString()}/>
      <Row uniqId="src-type" label="Source Type" value={ChatSourceTypeToString(mainChat.sourceType)}/>

      <hr/>

      <Row uniqId="ds-id" label="Dataset UUID" value={mainChat.dsUuid!.value}/>
      <Row uniqId="ds-name" label="Dataset" value={args.dsState.ds.alias}/>
      <Row uniqId="db" label="Database" value={args.dsState.fileKey}/>
    </div>
  </>
}

function getWindowDimensions(): WindowDimensions {
  const { innerWidth: width, innerHeight: height } = window;
  return {
    width,
    height
  };
}

function Row(args: { uniqId: string, label: string, value: string }): React.JSX.Element {
  let fieldsetClass = "flex items-center gap-5"
  let labelClass = "w-[125px]"
  let valueClass = "inline-flex w-full flex-1 items-left justify-left rounded px-2.5 leading-none toutline-none focus:shadow-[0_0_0_2px]"

  return <>
    <fieldset className={fieldsetClass}>
      <label htmlFor={args.uniqId} className={labelClass}>
        {args.label}
      </label>

      <input id={args.uniqId} className={valueClass} contentEditable={false}
             defaultValue={args.value}/>
    </fieldset>
  </>
}

interface WindowDimensions {
  width: number;
  height: number;
}
