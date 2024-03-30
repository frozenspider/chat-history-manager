'use client'

import { invoke, InvokeArgs } from "@tauri-apps/api/core";

export function Assert(cond: boolean, message: string): asserts cond {
  if (!cond) {
    throw new Error(message)
  }
}

export function AssertDefined<T>(v: T | undefined, valueName?: string): asserts v is T {
  Assert(v !== undefined, (valueName ?? "Value") + " is undefined")
}

export function AssertUnreachable(x: never): never {
  Unreachable()
}

export function Unreachable(): never {
  throw new Error("Didn't expect to get here");
}

// TODO: Make this a global constant?
export function IsTauriAvailable(): boolean {
  return '__TAURI__' in window
}

export function ReportError(message: String) {
  if (IsTauriAvailable()) {
    InvokeTauri<void>('report_error_string', { error: message })
  } else {
    window.alert("Error: " + message)
  }
}

export function WrapPromise<T>(p: Promise<T>): Promise<T | void> {
  return p.catch((reason) => ReportError(reason.toString()))
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

/** Convers a numeric timestamp (epoch seconds) to yyyy-MM-dd HH:mm(:ss) string */
export function TimestampToString(ts: bigint, includeSeconds: boolean): string {
  Assert(ts <= Number.MAX_SAFE_INTEGER, "Timestamp is too large")
  let tsDate = new Date(Number(ts) * 1000)
  // Convers a numeric timestamp to yyyy-MM-dd HH:mm:ss string
  return ZeroPadLeft(tsDate.getFullYear(), 4)
    + "-" + ZeroPadLeft(tsDate.getMonth() + 1, 2)
    + "-" + ZeroPadLeft(tsDate.getDate(), 2) +
    " " + ZeroPadLeft(tsDate.getHours(), 2)
    + ":" + ZeroPadLeft(tsDate.getMinutes(), 2)
    + (includeSeconds ? ":" + ZeroPadLeft(tsDate.getSeconds(), 2) : "")
}

function ZeroPadLeft(s: string | number, desiredWidth: number): string {
  return s.toString().padStart(desiredWidth, '0')
}

const BigIntZero: bigint = BigInt(0)

/**
 * Returns the value, or null if it's null/undefined/default primitive value
 * (since protobuf doesn't let us distinguish between default primitive value and unset value).
 */
export function GetNonDefaultOrNull<T>(v: T | null | undefined): T | null {
  if (v === undefined || v === null) return null
  if (typeof v === "string" && v === "") return null
  if (typeof v === "number" && v === 0) return null
  if (typeof v === "bigint" && v == BigIntZero) return null
  return v
}

export function RandomInt(from: number, to: number): number {
  return Math.floor(Math.random() * (to - from + 1) + from)
}