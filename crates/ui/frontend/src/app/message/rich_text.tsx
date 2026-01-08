'use client'

import React from "react";
import { cn } from "@/lib/utils"

import { RichTextElement } from "@/protobuf/core/protobuf/entities";
import { AssertDefined, AssertUnreachable, Deduplicate } from "@/app/utils/utils";
import ColoredBlockquote from "@/app/message/colored_blockquote";

export default function MessageRichText(args: {
  msgInternalId: bigint,
  rtes: RichTextElement[],
  borderColorClass: string
}): React.JSX.Element {
  let hiddenLinks =
    Deduplicate(args.rtes
      .flatMap(rte =>
        rte.val?.$case === "link" && rte.val.link.hidden ? [rte.val.link.href] : []))

  let isSingularRte = args.rtes.length == 1
  return (
    <div>
      {
        args.rtes.map((rte, idx) => {
          let rteJsx = MessageRichTextElement(rte, args.borderColorClass, isSingularRte)
          return <React.Fragment key={args.msgInternalId.toString() + "_" + idx}>
            {rteJsx}
          </React.Fragment>
        })
      }
      {
        hiddenLinks.map(link =>
          <p key={link}>{MessageRichTextLink(link, link)}</p>)
      }
    </div>
  )
}

function MessageRichTextElement(
  rte: RichTextElement,
  borderColorClass: string,
  isSingularRte: boolean
): React.JSX.Element | null {
  AssertDefined(rte.val, "RichTextElement value")
  switch (rte.val.$case) {
    case "plain": {
      let text = rte.val.plain.text

      // If a lone RTE contains only emojis, make them larger
      // (Note that \p{Emoji} captures digits too)
      let sizeClass: string = "";
      if (isSingularRte && !/\d/g.test(text) && /\p{Emoji}/u.test(text)) {
        // Emoji take more than one UTF-16 code unit, so string.length for them would be 2 or more.
        // Special thanks goes to https://cestoliv.com/blog/how-to-count-emojis-with-javascript/
        // Intl.Segmenter is not available in Firefox (at least not in <=124), but as it's not a webview,
        // we use simpler alternative despite it not working for complex emojis
        let emojiLen = [...(Intl.Segmenter ? new Intl.Segmenter().segment(text) : text)].length
        if (emojiLen == 1) {
          sizeClass = "text-8xl"
        } else if (emojiLen <= 3) {
          sizeClass = "text-5xl"
        }
      }

      return <span className={cn("whitespace-pre-wrap", sizeClass)}>{text}</span>
    }
    case "bold":
      return <span className="whitespace-pre-wrap font-bold">{rte.val.bold.text}</span>
    case "italic":
      return <span className="whitespace-pre-wrap italic">{rte.val.italic.text}</span>
    case "underline":
      return <span className="whitespace-pre-wrap underline">{rte.val.underline.text}</span>
    case "strikethrough":
      return <span className="whitespace-pre-wrap line-through">{rte.val.strikethrough.text}</span>
    case "link":
      if (rte.val.link.hidden)
        return null
      return MessageRichTextLink(rte.val.link.href, rte.val.link.textOption ?? rte.val.link.href)
    case "prefmtInline":
      return <span className="whitespace-pre font-mono">{rte.val.prefmtInline.text}</span>
    case "prefmtBlock":
      // TODO: Use syntax highlighter
      return <pre className="font-mono">{rte.val.prefmtBlock.text}</pre>
    case "blockquote":
      return <ColoredBlockquote borderColorClass={borderColorClass} preWrap={true}>{
        rte.val.blockquote.text
      }</ColoredBlockquote>
    case "spoiler":
      return <span className="text-slate-500       bg-slate-500
                              hover:text-slate-600 hover:bg-slate-200
                              cursor-pointer">{rte.val.spoiler.text}</span>
    default:
      AssertUnreachable(rte.val)
  }
}

function MessageRichTextLink(href: string, text: string): React.JSX.Element {
  // TODO: Doesn't work in Tauri!
  return (
    <a target="_blank"
       href={href}
       className="whitespace-pre-wrap underline text-blue-600 hover:text-blue-800"
    >{text}</a>
  )
}
