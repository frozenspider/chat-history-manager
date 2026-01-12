'use client'

import React from "react";

import StaticPlaceholderImage from '../../../public/placeholder.svg'

import { StaticImport } from "next/dist/shared/lib/get-img-props";
import { parsePhoneNumberWithError } from "libphonenumber-js/max";

import {
  Chat,
  ChatType,
  chatTypeToJSON,
  ContentSharedContact,
  Message,
  SourceType,
  sourceTypeToJSON,
  User
} from "@/protobuf/core/protobuf/entities";
import { ChatWithDetailsPB } from "@/protobuf/backend/protobuf/services";
import {
  AssertDefined,
  AssertUnreachable,
  Deduplicate,
  EnsureDefined,
  GetNonDefaultOrNull,
  ObjAsc,
  ObjDesc,
  ReportError
} from "@/app/utils/utils";

export const PlaceholderImageSvg: StaticImport = StaticPlaceholderImage

export const MessagesBatchSize: bigint = BigInt(100)
export const RepliesMaxDepth: bigint = BigInt(2)

export type FileKey = string
export type UuidString = string
export type ChatId = bigint
export type MsgSourceId = bigint
export type ChatAndMessage = [Chat, Message]

export type ReactChild = React.JSX.Element | string | null
export type ReactChildren = ReactChild | ReactChild[]

/**
 * Tailwind REQUIRES us to embed color class names in code,
 * see https://tailwindcss.com/docs/content-configuration#class-detection-in-depth
 */
export interface TailwindColor {
  text: string,
  border: string
}

const DefaultColorStyle: TailwindColor =
  { text: "text-inherit", border: "border-inherit" }

const CycleColorStyles: TailwindColor[] = [
  // User
  { text: "text-blue-500", border: "border-blue-500" },     // "#6495ED", // CornflowerBlue
  // First interlocutor
  { text: "text-red-600", border: "border-red-600" },        // "#B22222", // FireBrick
  { text: "text-green-600", border: "border-green-600" },    // "#008000", // Green
  { text: "text-yellow-700", border: "border-yellow-700" },     // "#DAA520", // GoldenRod
  { text: "text-fuchsia-700", border: "border-fuchsia-700" },    // "#BA55D3", // MediumOrchid
  { text: "text-pink-400", border: "border-pink-400" },     // "#FF69B4", // HotPink
  { text: "text-amber-500", border: "border-amber-500" },     // "#808000", // Olive
  { text: "text-teal-600", border: "border-teal-600" },       // "#008080", // Teal
  { text: "text-indigo-500", border: "border-indigo-500" },     // "#9ACD32", // YellowGreen
  { text: "text-orange-700", border: "border-orange-700" },     // "#FF8C00", // DarkOrange
  { text: "text-cyan-400", border: "border-cyan-400" },     // "#00D0D0", // Cyan-ish
  { text: "text-amber-800", border: "border-amber-800" },      // "#BDB76B" // DarkKhaki
]

/** Negative numbers return default style */
export function NameColorClassFromNumber(i: number | bigint): TailwindColor {
  if (i < 0) {
    return DefaultColorStyle
  }

  return CycleColorStyles[Number(BigInt(i) % BigInt(CycleColorStyles.length))]
}

export function NameColorClassFromPrettyName(prettyName: string | null, members: User[]): TailwindColor {
  return NameColorClassFromNumber(FindMemberIdxByPrettyName(prettyName, members))
}

export function FindMemberIdxByPrettyName(prettyName: string | null, members: User[]): number {
  return members.findIndex(u => GetUserPrettyName(u) == prettyName)
}

export function NameColorClassFromMembers(userId: bigint | null, memberIds: bigint[]): TailwindColor {
  if (userId === null)
    return DefaultColorStyle
  let idx = memberIds.indexOf(userId)
  return idx == -1 ? DefaultColorStyle : NameColorClassFromNumber(idx)
}

export const Unnamed = "[unnamed]"

export function GetUserPrettyName(user: User | ContentSharedContact | null): string {
  if (!user) {
    return Unnamed
  } else if (user.firstNameOption && user.lastNameOption) {
    return user.firstNameOption + " " + user.lastNameOption
  } else if (user.firstNameOption) {
    return user.firstNameOption
  } else if (user.lastNameOption) {
    return user.lastNameOption
  } else if (user.phoneNumberOption) {
    return GetPrettyPhoneNumber(user.phoneNumberOption)
  } else if ((user as User).usernameOption) {
    return (user as User).usernameOption!
  } else {
    return Unnamed
  }
}

export function GetChatPrettyName(chat: Chat | null): string {
  return chat?.nameOption || Unnamed
}

// (Should be kept in sync with UserUpdatedEvent listener and core::utils::entity_utils::PhoneNumber)
export function GetPrettyPhoneNumber(pn: string): string {
  if (pn.startsWith("00")) {
    pn = "+" + pn.slice(2)
  }
  try {
    return parsePhoneNumberWithError(pn).format("INTERNATIONAL")
  } catch (error) {
    if (pn.includes("-")) {
      // WhatsApp sometimes stores numbers with dashes that phonenumber doesn't like, e.g. +62 XXX-XXXX-XXXX
      // Strip them and try again
      return GetPrettyPhoneNumber(pn.replace(/-/g, ""))
    }
    if (pn.length >= 11 && !pn.startsWith('0') && !pn.startsWith('+')) {
      // Pretty sure it's an international number missing the plus sign
      return GetPrettyPhoneNumber("+" + pn)
    }
    // Not a phone number, non-existent country, etc.
    return pn
  }
}

export function GetChatQualifiedName(chat: Chat): string {
  return `'${GetChatPrettyName(chat)}' (#${chat.id})`
}

export function GetChatInterlocutor(cwd: ChatWithDetailsPB): User | null {
  if (EnsureDefined(cwd.chat).tpe === ChatType.PERSONAL && cwd.members.length > 1) {
    return cwd.members[1]
  } else {
    return null
  }
}

export function GetCombinedChat1to1Interlocutors(cc: CombinedChat): User[] {
  if (EnsureDefined(cc.mainCwd.chat).tpe === ChatType.PERSONAL && cc.members.length > 1) {
    let myselfId = cc.mainCwd.chat!.memberIds[0]
    return cc.members.filter(u => u.id !== myselfId)
  } else {
    return []
  }
}

export function ChatMatchesString(cwd: ChatWithDetailsPB, searchTerm: string) {
  let termLc = searchTerm.toLowerCase()
  let chat = cwd.chat!
  if (
    termLc == "" ||
    chat.id.toString().includes(termLc) ||
    IdToReadable(chat.id).includes(termLc) ||
    chat.nameOption?.toLowerCase()?.includes(termLc) ||
    ChatSourceTypeToString(chat.sourceType).toLowerCase()?.includes(termLc) ||
    ChatTypeToString(chat.tpe).toLowerCase().includes(termLc) ||
    chat.msgCount.toString().includes(termLc) ||
    cwd.lastMsgOption?.searchableString?.toLowerCase()?.includes(termLc)
  ) return true
  // Member 0 is self
  let interlocutors = cwd.members.slice(1)
  return interlocutors.some(u =>
    u?.firstNameOption?.toLowerCase()?.includes(termLc) ||
    u?.lastNameOption?.toLowerCase()?.includes(termLc) ||
    u?.usernameOption?.toLowerCase()?.includes(termLc) ||
    u?.phoneNumberOption?.toLowerCase()?.includes(termLc)
  )
}

export class CombinedChat {
  readonly mainChatId: bigint
  readonly cwds: ChatWithDetailsPB[]

  constructor(
    mainCwd: ChatWithDetailsPB,
    slaveCwds: ChatWithDetailsPB[]
  ) {
    let sortedCwds = slaveCwds.sort((a, b) =>
      a.chat!.id < b.chat!.id ? -1 : 1)
    AssertDefined(mainCwd.chat, "CWD.chat")
    AssertDefined(mainCwd.chat.dsUuid, "CWD.chat.dsUuid")
    this.mainChatId = mainCwd.chat!.id
    this.cwds = [mainCwd, ...sortedCwds]
  }

  /** Used after JSON deserialization, inefficient */
  static fromObject(obj: any): CombinedChat {
    let mainChatId = BigInt(obj.mainChatId)
    let cwds = obj.cwds.map((cwd: any) => ChatWithDetailsPB.fromJSON(cwd))
    let mainCwd = cwds.find((cwd: any) => cwd.chat!.id === mainChatId)!
    let slaveCwds = cwds.filter((cwd: any) => cwd.chat!.id !== mainChatId)
    return new CombinedChat(mainCwd, slaveCwds)
  }

  get dsUuid(): string {
    return this.mainCwd.chat!.dsUuid!.value
  }

  get mainCwd(): ChatWithDetailsPB {
    return this.cwds.find(cwd => cwd.chat!.id === this.mainChatId)!
  }

  get members(): User[] {
    return Deduplicate(this.cwds.flatMap(cwd => cwd.members), u => u.id)
  }

  get memberIds(): bigint[] {
    return this.members.map(m => m.id)
  }

  get lastMsgOption(): [Message, ChatWithDetailsPB] | [null, null] {
    let resArray = this.cwds
      .map(cwd => [GetNonDefaultOrNull(cwd.lastMsgOption), cwd] as [Message, ChatWithDetailsPB])
      .filter(([m, _]) => m !== null)
      .sort(ObjDesc(([msg, _]) => msg!.timestamp))
    return resArray.length > 0 ? resArray[0] : [null, null]
  }
}

export function ChatAndMessageAsc(lhs: ChatAndMessage, rhs: ChatAndMessage): number {
  // Messages from the same chat are ordered by their internal ID
  let get: (msg: Message) => bigint =
    lhs[0].id === rhs[0].id
      ? (msg => msg.internalId)
      : (msg => msg.timestamp)
  return ObjAsc(get)(lhs[1], rhs[1])
}

export function IdToReadable(id: bigint): string {
  return id.toString().split("").reverse().join("").match(/.{1,3}/g)!.join(" ").split("").reverse().join("")
}

export function ChatTypeToString(tpe: ChatType): string {
  switch (tpe) {
    case ChatType.PERSONAL:
      return "Personal (1 to 1)"
    case ChatType.PRIVATE_GROUP:
      return "Private Group"
    case ChatType.UNRECOGNIZED:
      ReportError(`Unrecognized chat type: ${chatTypeToJSON(tpe)}`);
      return "";
    default:
      AssertUnreachable(tpe)
  }
}

export function ChatSourceTypeToString(sourceType: SourceType): string {
  switch (sourceType) {
    case SourceType.TEXT_IMPORT:
      return "Text import"
    case SourceType.TELEGRAM:
      return "Telegram"
    case SourceType.WHATSAPP_DB:
      return "WhatsApp"
    case SourceType.SIGNAL:
      return "Signal"
    case SourceType.TINDER_DB:
      return "Tinder"
    case SourceType.BADOO_DB:
      return "Badoo"
    case SourceType.MRA:
      return "Mail.Ru Agent"
    case SourceType.UNRECOGNIZED:
      ReportError(`Unrecognized chat source type: ${sourceTypeToJSON(sourceType)}`);
      return "";
    default:
      AssertUnreachable(sourceType)
  }
}
