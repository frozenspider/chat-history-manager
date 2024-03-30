'use client'

import React from "react";

import { RichTextElement } from "@/protobuf/core/protobuf/entities";
import { AssertDefined, AssertUnreachable } from "@/app/utils/utils";

export default function MessageRichText(args: {
  msgInternalId: bigint,
  rtes: RichTextElement[]
}): React.JSX.Element {
  return (
    <div>{
      args.rtes.map((rte, idx) => {
        let rteJsx = MessageRichTextElement(rte)
        return <React.Fragment key={args.msgInternalId.toString() + "_" + idx}>
          {rteJsx}{rteJsx ? " " : null}
        </React.Fragment>;
      })
    }</div>
  )
}

function MessageRichTextElement(rte: RichTextElement): React.JSX.Element | null {
  let val = AssertDefined(rte.val, "RichTextElement value")
  switch (val.$case) {
    case "plain":
      return <span>{val.plain.text}</span>
    case "bold":
      return <span className="font-bold">{val.bold.text}</span>
    case "italic":
      return <span className="italic">{val.italic.text}</span>
    case "underline":
      return <span className="underline">{val.underline.text}</span>
    case "strikethrough":
      return <span className="line-through">{val.strikethrough.text}</span>
    case "link":
      if (val.link.hidden) {
        return null
      } else {
        // FIXME
        return <span className="text-red-500">FIXME: Link!</span>
        //return <a target="_blank" href={val.link.href}>{val.link.text_option ?? val.link.href}</a>
      }
    case "prefmtInline":
      return <span className="font-mono">{val.prefmtInline.text}</span>
    case "prefmtBlock":
      // TODO: Use syntax highlighter
      return <pre className="font-mono">{val.prefmtBlock.text}</pre>
    case "blockquote":
      return <blockquote
        className="border-l-4 pl-2 border-blue-500 cursor-pointer">{val.blockquote.text}</blockquote>
    case "spoiler":
      return <span className="text-slate-500       bg-slate-500
                              hover:text-slate-600 hover:bg-slate-200
                              cursor-pointer">{val.spoiler.text}</span>
    default:
      AssertUnreachable(val)
  }
}
