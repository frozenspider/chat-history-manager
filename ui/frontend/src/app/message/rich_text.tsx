'use client'

import React from "react";

import { RichTextElement } from "@/protobuf/core/protobuf/entities";
import { AssertDefined, AssertUnreachable, Deduplicate } from "@/app/utils/utils";

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
          <p key={link}><MessageRichTextLink href={link} text={link}/></p>)
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
      return <MessageRichTextLink href={rte.val.link.href} text={rte.val.link.textOption ?? rte.val.link.href}/>
    case "prefmtInline":
      return <span className="whitespace-pre font-mono">{rte.val.prefmtInline.text}</span>
    case "prefmtBlock":
      // TODO: Use syntax highlighter
      return <pre className="font-mono">{rte.val.prefmtBlock.text}</pre>
    case "blockquote":
      return <blockquote className={"whitespace-pre-wrap border-l-4 pl-2 " + borderColorClass}>{
        rte.val.blockquote.text
      }</blockquote>
    case "spoiler":
      return <span className="text-slate-500       bg-slate-500
                              hover:text-slate-600 hover:bg-slate-200
                              cursor-pointer">{rte.val.spoiler.text}</span>
    default:
      AssertUnreachable(rte.val)
  }
}

function MessageRichTextLink(args: {
  href: string,
  text: string
}) {
  // TODO: Doesn't work in Tauri!
  return (
    <a target="_blank" href={args.href} className="whitespace-pre-wrap underline text-blue-600 hover:text-blue-800">{
      args.text
    }</a>
  )
}
