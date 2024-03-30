'use client'

import { Chat, User } from "@/protobuf/core/protobuf/entities";

export const PlaceholderImage: string = "placeholder.svg"

export const MessagesBatchSize: bigint = BigInt(100)

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

export function NameColorClassFromNumber(i: number | bigint): TailwindColor {
  // [
  //   "#6495ED", // CornflowerBlue
  //   "#B22222", // FireBrick
  //   "#008000", // Green
  //   "#DAA520", // GoldenRod
  //   "#BA55D3", // MediumOrchid
  //   "#FF69B4", // HotPink
  //   "#808000", // Olive
  //   "#008080", // Teal
  //   "#9ACD32", // YellowGreen
  //   "#FF8C00", // DarkOrange
  //   "#00D0D0", // Cyan-ish
  //   "#BDB76B" // DarkKhaki
  // ]

  return CycleColorStyles[Number(BigInt(i) % BigInt(CycleColorStyles.length))]
}

export function NameColorClassFromMembers(userId: bigint | null, memberIds: bigint[]): TailwindColor {
  if (userId === null)
    return DefaultColorStyle
  let idx = memberIds.indexOf(userId)
  return idx == -1 ? DefaultColorStyle : NameColorClassFromNumber(idx)
}

const Unnamed = "[unnamed]"

export function GetUserPrettyName(user: User | null): string {
  if (!user) {
    return Unnamed
  } else if (user.firstNameOption && user.lastNameOption) {
    return user.firstNameOption + " " + user.lastNameOption
  } else if (user.firstNameOption) {
    return user.firstNameOption
  } else if (user.lastNameOption) {
    return user.lastNameOption
  } else if (user.phoneNumberOption) {
    return user.phoneNumberOption
  } else if (user.usernameOption) {
    return user.usernameOption
  } else {
    return Unnamed
  }
}

export function GetChatPrettyName(chat: Chat): string {
  if (chat.nameOption) {
    return chat.nameOption
  } else {
    return Unnamed
  }
}
