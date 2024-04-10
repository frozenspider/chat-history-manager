'use client'

import React from "react";

import { Pause, Play } from "lucide-react";

import { Progress } from "@/components/ui/progress";

import { GetNonDefaultOrNull, SecondsToHhMmSsString } from "@/app/utils/utils";
import LazyContent, { LazyDataState } from "@/app/utils/lazy_content";
import { TestMp3Base64Data } from "@/app/utils/test_entities";
import MessagesLoadSpinner from "@/app/utils/load_spinner";

import SystemMessage from "@/app/message/system_message";

/**
 * Audio player component that lazily loads .
 * Since Safari *still* doesn't support OGG/OPUS containers in `<audio>` tag, we have to use a workaround.
 */
export default function AudioComponent(args: {
  elementName: string,
  relativePath: string | null,
  dsRoot: string,
  mimeType: string | null
}): React.JSX.Element {
  let [ogv, setOgv] = React.useState<any | null>(null)
  let [player, setPlayer] = React.useState<HTMLMediaElement | null>(null)
  let [isPlaying, setIsPlaying] = React.useState(false)
  let [srcUri, setSrcUri] = React.useState<string | null>(null)

  // Progress, 0 to 100
  let [progress, setProgress] = React.useState<number | null>(null)
  let [duration, setDuration] = React.useState<number | null>(null)

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
    let inner = async () => {
      let ogv = require("ogv")
      // Path to ogv-demuxer-ogg.js, ogv-worker-audio.js, dynamicaudio.swf etc
      ogv.OGVLoader.base = '/js/ogv';
      setOgv(ogv)
    }
    inner()
  }, [setOgv])

  // Initialize the player. Use ogv.js if appropriate, otherwise use HTML5 <audio>.
  React.useEffect(() => {
    if (!srcUri) return

    let player: HTMLMediaElement | null = null
    if (ogv) {
      // FIXME: OGVPlayer only loads the first megabyte of asset source and doesn't load more for some reason
      let ogvPlayer: OgvPlayer = new ogv.OGVPlayer()
      if (ogvPlayer.canPlayType(mimeType)) {
        ogvPlayer.type = mimeType!
        player = ogvPlayer
      } else {
        player = audioRef.current
      }
    }

    if (player) {
      player.src = srcUri

      player.onplaying = (_ev) => setIsPlaying(true)
      player.onpause = (_ev) => setIsPlaying(false)
      player.onended = (_ev) => {
        // Stream may not be seekable, se we need to reset the source to seek to start
        setIsPlaying(false)
        setProgress(0)
      }
      player.ondurationchange = (_ev) => setDuration(GetNonDefaultOrNull(player?.duration))
      player.ontimeupdate = (_ev) => {
        if (player && !isNaN(player.currentTime) && !isNaN(player.duration)) {
          setProgress(player.currentTime * 100 / player.duration)
        }
      }
      player.load()

      setPlayer(player)
    }
  }, [ogv, srcUri, mimeType, setPlayer, setIsPlaying, setProgress, setDuration])

  let audio = <audio ref={audioRef} className="hidden"/>
  let progressBar = <Progress value={progress} max={100}/>
  let durationEl = <Time value={duration}/>

  let inner = LazyContent(
    args.elementName,
    args.relativePath,
    args.dsRoot,
    mimeType!,
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
              <button onClick={() => isPlaying ? player?.pause() : player?.play()}>
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
        return <MessagesLoadSpinner center={false} text="Voice message loading..."/>
      }
    }
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
