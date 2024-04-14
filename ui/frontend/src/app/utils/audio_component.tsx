'use client'

import React from "react";

import { Pause, Play } from "lucide-react";

import { Progress } from "@/components/ui/progress";

import { SecondsToHhMmSsString } from "@/app/utils/utils";
import LazyContent, { LazyDataState } from "@/app/utils/lazy_content";
import { TestMp3Base64Data } from "@/app/utils/test_entities";
import LoadSpinner from "@/app/utils/load_spinner";

import SystemMessage from "@/app/message/system_message";

/**
 * Audio player component that lazily loads .
 * Since Safari *still* doesn't support OGG/OPUS containers in `<audio>` tag, we have to use a workaround.
 */
export default function AudioComponent(args: {
  elementName: string,
  relativePath: string | null,
  dsRoot: string,
  mimeType: string | null,
  duration: number | null
}): React.JSX.Element {
  let [ogv, setOgv] = React.useState<any | null>(null)
  let [isPlaying, setIsPlaying] = React.useState(false)
  let [srcUri, setSrcUri] = React.useState<string | null>(null)

  // Progress, 0 to 100
  let [progress, setProgress] = React.useState<number | null>(null)
  let [duration, setDuration] = React.useState(args.duration)

  let audioRef = React.useRef<HTMLMediaElement | null>(null)

  let mimeType = args.mimeType

  if (!mimeType) {
    // Handling some basic MIME types
    if (!args.relativePath)
      mimeType = "audio/mpeg" // Placeholder audio type
    else if (args.relativePath.endsWith(".mp3"))
      mimeType = "audio/mpeg"
    else if (args.relativePath.endsWith(".ogg") || args.relativePath.endsWith(".opus"))
      mimeType = "audio/ogg"
    else if (args.relativePath.endsWith(".wav"))
      mimeType = "audio/wav"
    else
      mimeType = "audio/mpeg"
  } else if (mimeType == "audio/opus") {
    // Special case: ogv.js doesn't know about audio/opus
    mimeType = "audio/ogg"
  }

  // ogv.js cannot be initialized during prerender as it requires a document to work with
  React.useEffect(() => {
      setOgv(GetOrInitOgv())
  }, [setOgv])

  // Set up the player. Use ogv.js if appropriate, otherwise use HTML5 <audio>.
  let player = React.useMemo(() => {
    if (!srcUri || !ogv) return null

    let player: HTMLMediaElement | null = null
    // TODO: OGVPlayer only loads the first megabyte of asset source and doesn't load more for some reason.
    // As a temporary workaround, we're querying the audio asset as base64 uri.
    let ogvPlayer: OgvPlayer = new ogv.OGVPlayer()
    if (ogvPlayer.canPlayType(mimeType)) {
      ogvPlayer.type = mimeType!
      player = ogvPlayer
    } else {
      player = audioRef.current
    }

    if (!player) return null

    player.src = srcUri

    function updateProgress() {
      if (player && isFinite(player.currentTime) && duration && isFinite(duration)) {
        setProgress(player.currentTime * 100 / duration)
      }
    }

    player.onplaying = () => {
      setIsPlaying(true)
    }
    player.onpause = () => {
      setIsPlaying(false)
      updateProgress()
    }
    player.onended = () => {
      player.load() // Reset to start, even if source is not seekable
      setIsPlaying(false)
      setProgress(0)
    }
    player.ondurationchange = () => {
      if (isFinite(player.duration)) {
        setDuration(player.duration)
      }
    }
    player.ontimeupdate = () => {
      updateProgress()
    }

    return player
  }, [ogv, srcUri, mimeType, duration, setIsPlaying, setDuration, setProgress])

  let audio = <audio ref={audioRef} className="hidden"/>
  let progressBar = <Progress value={progress} max={100}/>
  let durationEl = <Time value={duration}/>

  let inner = LazyContent(
    args.elementName,
    args.relativePath,
    args.dsRoot,
    mimeType,
    (lazyData) => {
      if (lazyData.state == LazyDataState.Failure) {
        return <SystemMessage>Voice message loading failed</SystemMessage>
      } else if (lazyData.dataUri != null || lazyData.state == LazyDataState.TauriNotAvailable) {
        let dataUri = lazyData.dataUri
        if (lazyData.state == LazyDataState.TauriNotAvailable) {
          // If not using Tauri, use test data
          dataUri = TestMp3Base64Data
        }

        if (srcUri != dataUri) {
          setSrcUri(dataUri)
        }

        if (player) {
          return <>
            {lazyData.state == LazyDataState.TauriNotAvailable ?
              <SystemMessage>Test audio</SystemMessage> :
              <></>}
            <div className="m-1 flex items-center gap-2">
              <button onClick={() => isPlaying ? player.pause() : player.play()}>
                {isPlaying ? <Pause/> : <Play/>}
              </button>
              {progressBar}
              {durationEl}
            </div>
          </>
        } else {
          return <SystemMessage>Audio player did not load</SystemMessage>
        }
      } else {
        return <LoadSpinner center={false} text="Voice message loading..."/>
      }
    },
    false,
    true
  )

  return (
    <div className="block w-full max-w-md mr-auto border-2 p-2">
      {inner}
      {audio}
    </div>
  )
}

type OgvPlayer = HTMLMediaElement & {
  /** MIME type */
  type: string
}

function Time(args: {
  value: number | null
}): React.JSX.Element {
  if (args.value == null) {
    return <>??:??</>
  }
  let mainPart = SecondsToHhMmSsString(Math.trunc(args.value))
  let decimals = Math.round((args.value % 1) * 10)
  return <p>
    <span>{mainPart}</span><span className="text-xs">{decimals > 0 ? "." + decimals : ""}</span>
  </p>
}

let __globalOgv: any = null

// Requires document to be present, so it can only be called from an async function inside React effect
function GetOrInitOgv(): any {
  if (!__globalOgv) {
      __globalOgv = require("ogv")
      // Path to ogv-demuxer-ogg.js, ogv-worker-audio.js, dynamicaudio.swf etc
      __globalOgv.OGVLoader.base = '/js/ogv';
  }
  return __globalOgv
}
