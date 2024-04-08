'use client'

import { invoke, InvokeArgs } from "@tauri-apps/api/core";

export function Assert(cond: boolean, message?: string): asserts cond {
  if (!cond) throw new Error(message ?? "Assertion failed")
}

export function AssertDefined<T>(v: T | undefined, valueName?: string): asserts v is T {
  Assert(v !== undefined, (valueName ?? "Value") + " is undefined")
}

export function AssertUnreachable(_: never): never {
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

export async function PromiseCatchReportError<T>(p: Promise<T>): Promise<T | void> {
  return p.catch(reason => ReportError(reason.toString()))
}

/**
 * We're abstracting the invoke function to work around the case when Tauri is not available.
 * We don't return the Tauri promise.
 */
export function InvokeTauri<T, R = void>(
  cmd: string,
  args?: InvokeArgs,
  onSuccess?: ((arg: T) => R),
  onError?: ((error: any) => void),
) {
  if (IsTauriAvailable() && onError) {
    invoke<T>(cmd, args).then(onSuccess).catch(onError)
  } else {
    InvokeTauriAsync<T>(cmd, args).then(v => {
      // There's no good way to typeguard against void
      if (v && onSuccess) return onSuccess(v)
    })
  }
}

export async function InvokeTauriAsync<T>(
  cmd: string,
  args?: InvokeArgs,
): Promise<T | void> {
  if (IsTauriAvailable()) {
    return PromiseCatchReportError(invoke<T>(cmd, args))
  } else {
    const msg = "Calling " + cmd + "(" + JSON.stringify(args) + ") but Tauri is not available"
    console.warn(msg)
    window.alert(msg)
    return Promise.resolve()
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

export function SecondsToHhMmSsString(seconds: number): string {
  let hours = Math.floor(seconds / 3600)
  let minutes = Math.floor((seconds % 3600) / 60)
  let remainingSeconds = seconds % 60

  function dropWhile<T>(arr: T[], pred: (t: T) => boolean) {
    while (arr.length > 0 && !pred(arr[0])) arr = arr.slice(1)
    return arr
  }

  return dropWhile([hours, minutes, remainingSeconds], x => x > 0).join(":")
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

export function GetOrInsertDefault<K, V>(m: Map<K, V>, key: K, getDefaultValue: () => V): V {
  let v = m.get(key)
  if (v === undefined) {
    v = getDefaultValue()
    m.set(key, v)
  }
  return v
}

export function Deduplicate<T, By = T>(arr: T[], by?: (t: T) => By): T[] {
  let set = new Set<T | By>()
  return arr.filter((v) => {
    let key = by ? by(v) : v
    if (set.has(key)) return false
    set.add(key)
    return true
  })
}

export function CreateMapFromKeys<K, V>(keys: K[], getValue: (k: K) => V): Map<K, V> {
  let result = new Map<K, V>()
  for (let k of keys) {
    result.set(k, getValue(k))
  }
  return result
}

// Can't believe I have to write this myself
export function ForAll<T>(iter: IterableIterator<T>, pred: (t: T) => boolean): boolean {
  for (let item of iter) {
    if (!pred(item)) return false
  }
  return true
}

//
// Ordering
//

export function Asc<N extends bigint | number>(lhs: N, rhs: N): number {
  return Number(lhs - rhs)
}

export function Desc<N extends bigint | number>(lhs: N, rhs: N): number {
  return Number(rhs - lhs)
}

export function ObjAsc<T, N extends bigint | number>(get: (obj: T) => N): (lhs: T, rhs: T) => number {
  return (lhs: T, rhs: T) => Asc(get(lhs), get(rhs))
}

export function ObjDesc<T, N extends bigint | number>(get: (obj: T) => N): (lhs: T, rhs: T) => number {
  return (lhs: T, rhs: T) => Desc(get(lhs), get(rhs))
}
