'use client'

import React from "react";

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

  return (
    <div>
      {
        args.rtes.map((rte, idx) => {
          let rteJsx = MessageRichTextElement(rte, args.borderColorClass)
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

function MessageRichTextElement(rte: RichTextElement, borderColorClass: string): React.JSX.Element | null {
  AssertDefined(rte.val, "RichTextElement value")
  switch (rte.val.$case) {
    case "plain":
      return <span className="whitespace-pre-wrap">{rte.val.plain.text}</span>
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
