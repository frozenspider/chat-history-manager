import React from "react";

import {
  ChatSourceTypeToString,
  ChatTypeToString,
  CombinedChat,
  GetChatPrettyName,
  GetCombinedChat1to1Interlocutors,
  IdToReadable
} from "@/app/utils/entity_utils";
import { DatasetState } from "@/app/utils/state";
import { GetNonDefaultOrNull } from "@/app/utils/utils";
import TauriImage from "@/app/general/tauri_image";

export default function ChatFullDetailsComponent(args: {
  cc: CombinedChat,
  dsState: DatasetState
}): React.JSX.Element {
  const [windowDimensions, setWindowDimensions] =
    React.useState<WindowDimensions>(getWindowDimensions());

  let mainChat = args.cc.mainCwd.chat!

  let imgs = [GetNonDefaultOrNull(mainChat.imgPathOption)]
  let interlocutors = GetCombinedChat1to1Interlocutors(args.cc)
  for (let interlocutor of interlocutors) {
    for (let pp of interlocutor.profilePictures) {
      imgs.push(GetNonDefaultOrNull(pp.path))
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
      <Row uniqId="msgs" label="# Messages" value={
        args.cc.cwds.reduce((acc, cwd) => acc + cwd.chat!.msgCount, 0).toString()
      }/>
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
