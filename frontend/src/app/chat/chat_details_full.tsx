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
import {
  FilterExistingPathAsync,
  GetNonDefaultOrNull,
  PromiseCatchReportError
} from "@/app/utils/utils";
import TauriImage from "@/app/general/tauri_image";
import { Carousel } from "react-responsive-carousel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";


export default function ChatFullDetailsComponent(args: {
  cc: CombinedChat,
  dsState: DatasetState
}): React.JSX.Element {
  const [existingRelPaths, setExistingRelPaths] =
    React.useState<string[]>([]);

  const [windowDimensions, setWindowDimensions] =
    React.useState<WindowDimensions>(getWindowDimensions());

  let mainChat = args.cc.mainCwd.chat!

  // Load existing images
  React.useEffect(() => {
    PromiseCatchReportError(async () => {
      let interlocutors = GetCombinedChat1to1Interlocutors(args.cc)
      let pics = [
        GetNonDefaultOrNull(mainChat.imgPathOption),
        ...interlocutors
          .flatMap(i => i.profilePictures)
          .filter(pp => pp.path)
          .map(pp => pp.path)
      ].filter(p => p).map(p => p!)
      let existingPaths = await FilterExistingPathAsync(pics, args.dsState.dsRoot)
      setExistingRelPaths(existingPaths)
    })
  }, [args.cc, args.dsState, setExistingRelPaths])

  React.useEffect(() => {
    function handleResize() {
      setWindowDimensions(getWindowDimensions());
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // TODO: Make images clickable to view full size
  // TODO: Make chat ID clickable to edit?

  const CarouselArrowsCommonClasses = "absolute h-8 w-8 rounded-full top-1/2 -translate-y-1/2 z-10"

  return <>
    <div className="flex flex-col gap-2.5 p-5">

      {existingRelPaths.length > 0 &&
          // See https://react-responsive-carousel.js.org/storybook/
          <Carousel autoPlay={false} showThumbs={false} swipeable={false} showStatus={false} transitionTime={0}
                    showIndicators={existingRelPaths.length > 1}
                    className="select-none"
                    renderArrowPrev={(clickHandler, hasPrev, label) =>
                      existingRelPaths.length > 1 && <Button
                        variant="default"
                        size="icon"
                        className={cn(CarouselArrowsCommonClasses, "-left-0")}
                        disabled={!hasPrev}
                        onClick={clickHandler}
                      >
                        <ArrowLeft className="h-4 w-4"/>
                        <span className="sr-only">{label}</span>
                      </Button>
                    }
                    renderArrowNext={(clickHandler, hasNext, label) =>
                      existingRelPaths.length > 1 && <Button
                        variant="default"
                        size="icon"
                        className={cn(CarouselArrowsCommonClasses, "-right-0")}
                        disabled={!hasNext}
                        onClick={clickHandler}
                      >
                        <ArrowRight className="h-4 w-4"/>
                        <span className="sr-only">{label}</span>
                      </Button>
                    }
          >
            {
              existingRelPaths.map(relPath =>
                <div key={relPath}>
                  <TauriImage elementName={"Image"}
                              relativePathAsync={async () => relPath}
                              dsRoot={args.dsState.dsRoot}
                              width={0}
                              height={0}
                              mimeType={null /* unknown */}
                              additional={{
                                maxWidth: windowDimensions.width - 100,
                                maxHeight: 400,
                                keepPlaceholderOnNull: true
                              }}/>
                </div>)
            }
          </Carousel>}

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
  let labelClass = "w-[125px] select-none"
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
