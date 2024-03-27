'use client'

import React from "react";

import { RichTextElement } from "@/protobuf/core/protobuf/entities";

export default function MessageRichText(args: {
  msgInternalId: number,
  rtes: RichTextElement[]
}): React.JSX.Element {
  return (
    <div>{
      args.rtes.map((rte, idx) => {
        let rteJsx = MessageRichTextElement(rte)
        return <React.Fragment key={args.msgInternalId + "_" + idx}>
          {rteJsx}{rteJsx ? " " : null}
        </React.Fragment>;
      })
    }</div>
  )
}

function MessageRichTextElement(rte: RichTextElement): React.JSX.Element | null {
  switch (rte.val?.$case) {
    case "plain":
      return <span>{rte.val.plain.text}</span>
    case "bold":
      return <span className="font-bold">{rte.val.bold.text}</span>
    case "italic":
      return <span className="italic">{rte.val.italic.text}</span>
    case "underline":
      return <span className="underline">{rte.val.underline.text}</span>
    case "strikethrough":
      return <span className="line-through">{rte.val.strikethrough.text}</span>
    case "link":
      if (rte.val.link.hidden) {
        return null
      } else {
        // FIXME
        return <span className="text-red-500">FIXME: Link!</span>
        //return <a target="_blank" href={rte.val.link.href}>{rte.val.link.text_option ?? rte.val.link.href}</a>
      }
    case "prefmt_inline":
      return <span className="font-mono">{rte.val.prefmt_inline.text}</span>
    case "prefmt_block":
      // TODO: Use syntax highlighter
      return <pre className="font-mono">{rte.val.prefmt_block.text}</pre>
    case "blockquote":
      return <blockquote
        className="border-l-4 pl-2 border-blue-500 cursor-pointer">{rte.val.blockquote.text}</blockquote>
    case "spoiler":
      return <span className="text-slate-500       bg-slate-500
                              hover:text-slate-600 hover:bg-slate-200
                              cursor-pointer">{rte.val.spoiler.text}</span>
    default:
      throw new Error("Unknown rich text element: " + JSON.stringify(rte.val))
  }
}
