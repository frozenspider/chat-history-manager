'use client'

import { invoke, InvokeArgs } from "@tauri-apps/api/core";
import { Chat, User } from "@/protobuf/core/protobuf/entities";

// TODO: Make this a global constant?
export function IsTauriAvailable(): boolean {
  return '__TAURI__' in window
}

export const PlaceholderImage: string = "placeholder.svg"

export function ReportError(message: String) {
  if (IsTauriAvailable()) {
    InvokeTauri<void>('report_error_string', {error: message})
  } else {
    window.alert("Error: " + message)
  }
}

/**
 * We're abstracting the invoke function to work around the case when Tauri is not available.
 * We don't return the Tauri promise.
 */
export function InvokeTauri<T, R = void>(cmd: string, args?: InvokeArgs, callback?: ((arg: T) => R)) {
  if (IsTauriAvailable()) {
    invoke<T>(cmd, args)
      .then(callback)
      .catch(console.error)
  } else {
    const msg = "Calling " + cmd + "(" + JSON.stringify(args) + ") but Tauri is not available"
    console.warn(msg)
    window.alert(msg)
  }
}

export function AssertDefined<T>(v: T | undefined): T {
  if (v === undefined) {
    throw new Error("Value {v} is undefined")
  }
  return v
}

export function AssertUnreachable(x: never): never {
  throw new Error("Didn't expect to get here");
}


/** Convers a numeric timestamp (epoch seconds) to yyyy-MM-dd HH:mm(:ss) string */
export function TimestampToString(ts: number, includeSeconds: boolean): string {
  let tsDate = new Date(ts * 1000)
  // Convers a numeric timestamp to yyyy-MM-dd HH:mm:ss string
  return ZeroPadLeft(tsDate.getFullYear(), 4)
    + "-" + ZeroPadLeft(tsDate.getMonth() + 1, 2)
    + "-" + ZeroPadLeft(tsDate.getDate(), 2) +
    " " + ZeroPadLeft(tsDate.getHours(), 2)
    + ":" + ZeroPadLeft(tsDate.getMinutes(), 2)
    + (includeSeconds ? ":" + ZeroPadLeft(tsDate.getSeconds(), 2) : "")
}

function ZeroPadLeft(s: String | number, desiredWidth: number): String {
  return s.toString().padStart(desiredWidth, '0')
}

// Returns the value, or null if it's null/undefined.
export function GetOrNull<T>(v: T | null | undefined): T | null {
  return v === undefined || v === null ? null : v
}

const CycleColorStyles: string[] = [
  // User
  "text-blue-500", // "#6495ED", // CornflowerBlue
  // First interlocutor
  "text-red-600", // "#B22222", // FireBrick
  "text-green-600", // "#008000", // Green
  "text-yellow-700", // "#DAA520", // GoldenRod
  "text-fuchsia-700", // "#BA55D3", // MediumOrchid
  "text-pink-400", // "#FF69B4", // HotPink
  "text-amber-500", // "#808000", // Olive
  "text-teal-600", // "#008080", // Teal
  "text-indigo-500", // "#9ACD32", // YellowGreen
  "text-orange-700", // "#FF8C00", // DarkOrange
  "text-cyan-400", // "#00D0D0", // Cyan-ish
  "text-amber-800", // "#BDB76B" // DarkKhaki
]

export function NameColorStyleFromNumber(i: number): string {
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

  return CycleColorStyles[i % CycleColorStyles.length]
}

const Unnamed = "[unnamed]"

export function GetUserPrettyName(user: User): string {
  if (user.first_name_option && user.last_name_option) {
    return user.first_name_option + " " + user.last_name_option
  } else if (user.first_name_option) {
    return user.first_name_option
  } else if (user.last_name_option) {
    return user.last_name_option
  } else if (user.phone_number_option) {
    return user.phone_number_option
  } else if (user.username_option) {
    return user.username_option
  } else {
    return Unnamed
  }
}

export function GetChatPrettyName(chat: Chat): string {
  if (chat.name_option) {
    return chat.name_option
  } else {
    return Unnamed
  }
}

export function RandomInt(from: number, to: number): number {
  return Math.floor(Math.random() * (to - from + 1) + from)
}
