'use client'

import { invoke, InvokeArgs } from "@tauri-apps/api/core";
import { listen, EventCallback, UnlistenFn, Event, EventName, emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ClientError } from "nice-grpc-common";
import { PopupConfirmedEventName, PopupReadyEventName, SetPopupStateEventName } from "@/app/utils/state";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export function Noop(): void {
}

export function Assert(cond: boolean, message?: string): asserts cond {
  if (!cond) throw new Error(message ?? "Assertion failed")
}

export function AssertDefined<T>(v: T | undefined, valueName?: string): asserts v is T {
  Assert(v !== undefined, (valueName ?? "Value") + " is undefined")
}

export function EnsureDefined<T>(v: T | undefined, valueName?: string): T {
  AssertDefined(v, valueName)
  return v
}

export function AssertUnreachable(_: never): never {
  Unreachable()
}

export function Unreachable(): never {
  throw new Error("Didn't expect to get here");
}

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

/** Wrapper function for promise that displays any error to user */
export function PromiseCatchReportError<T>(p: Promise<T> | (() => Promise<T>)): void {
  if (typeof p === "function") {
    p = p()
  }
  p.catch(err => {
    console.error("Error during promise evaluation", err)
    let message: string
    if (err instanceof ClientError) {
      message = err.details
    } else {
      message = err.toString()
    }
    ReportError(message)
  })
}

/**
 * We're abstracting the invoke function to work around the case when Tauri is not available.
 * We don't return the Tauri promise.
 */
export function InvokeTauri<T, R = void>(
  cmd: string,
  args?: InvokeArgs,
  onSuccess?: ((arg: T) => R),
  onError?: ((err: any) => void),
) {
  let promise: Promise<R | void | null> = InvokeTauriAsync<T>(cmd, args).then(v =>
    (v && onSuccess) ? onSuccess(v) : null
  )
  if (onError) {
    promise = promise.catch(err => onError(err))
  }
  PromiseCatchReportError(promise)
}

export async function InvokeTauriAsync<T>(
  cmd: string,
  args?: InvokeArgs,
): Promise<T | null> {
  if (IsTauriAvailable()) {
    return invoke<T>(cmd, args)
  } else {
    const msg = "Calling " + cmd + "(" + JSON.stringify(args) + ") but Tauri is not available"
    console.warn(msg)
    window.alert(msg)
    return Promise.resolve(null)
  }
}

/** Listens to events emitted to the current webview. */
// WARNING: Make sure to Listen in useEffect, and unlisten in the cleanup function
export async function Listen<T>(event: EventName, cb: EventCallback<T>): Promise<UnlistenFn> {
  if (IsTauriAvailable()) {
    return listen<T>(event, cb, { target: getCurrentWebview().label })
  } else {
    console.warn("Listening to " + event + " but Tauri is not available")
    return Noop
  }
}

/** Emit an event to the current webview. */
export async function EmitToSelf(event: EventName, payload?: unknown): Promise<void> {
  if (IsTauriAvailable()) {
    return emitTo(getCurrentWebview().label, event, payload)
  } else {
    console.warn("Listening to " + event + " but Tauri is not available")
    return Noop()
  }
}

export function SpawnPopup<T>(
  windowLabel: string,
  title: string,
  pageUrl: string,
  w: number,
  h: number,
  optional?: {
    setState?: () => T,
    onConfirmed?: (ev: Event<T>) => void,
    // Cannot make this typesafe, let's assume everyone works with JSON
    listeners?: [eventName: EventName, (ev: Event<string>) => Promise<void>][]
  }
): void {
  if (!IsTauriAvailable()) {
    ReportError("Can't create a popup without Tauri!")
    return;
  }

  // TODO: If spawning window is refreshed manually, popup is messed up.
  //       Parent no longer listens to its events, and popup refuses to close - presumably because of
  //       some error in onCloseRequested, but since the console is destroyed, I can't see what's happening.

  const webview = new WebviewWindow(windowLabel, {
    title,
    url: pageUrl,
    width: w,
    height: h,
    center: true
  });

  let unlistenPromises: Promise<UnlistenFn>[] = []

  if (optional?.setState) {
    unlistenPromises.push(webview.once(PopupReadyEventName, () => {
      const state = optional.setState!()
      PromiseCatchReportError(emitTo(webview.label, SetPopupStateEventName, state));
    }))
  }

  if (optional?.onConfirmed) {
    unlistenPromises.push(webview.once<T>(PopupConfirmedEventName, (ev) => optional.onConfirmed!(ev)))
  }

  if (optional?.listeners) {
    for (let [eventName, cb] of optional.listeners) {
      unlistenPromises.push(webview.listen(eventName, cb))
    }
  }

  unlistenPromises.push(webview.onCloseRequested((_ev) => {
    PromiseCatchReportError(async () => {
      await Promise.all(unlistenPromises.map(p => p.then(f => f())))
    })
  }))
}

export function ToAbsolutePath(relativePath: string, dsRoot: string): string {
  return dsRoot + "/" + relativePath
}

export async function FilterExistingPathAsync(paths: string[], dsRoot: string): Promise<string[]> {
  if (!IsTauriAvailable()) {
    console.warn("Can't determine if path exists, returning []")
    return []
  }
  let res: string[] = []
  for (let p of paths) {
    if (await InvokeTauriAsync<boolean>("file_exists", { relativePath: p, dsRoot }))
      res.push(p)
  }
  return res
}

export async function FindExistingPathAsync(paths: string[], dsRoot: string): Promise<string | null> {
  return FilterExistingPathAsync(paths, dsRoot).then(res => res.length > 0 ? res[0] : null)
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

/**
 * If seconds is less than an hour, returns m:ss
 * Otherwise, return `h:mm:ss`
 */
export function SecondsToHhMmSsString(seconds: number): string {
  let hours = Math.floor(seconds / 3600)
  let minutes = Math.floor((seconds % 3600) / 60)
  let remainingSeconds = seconds % 60

  let ss = remainingSeconds.toString().padStart(2, "0")
  if (hours > 0) {
    let h = hours.toString()
    let mm = minutes.toString().padStart(2, "0")
    return h + ":" + mm + ":" + ss
  } else {
    let m = minutes.toString()
    return m + ":" + ss
  }
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

// Can't believe I have to write this myself
export function Count<T>(iter: IterableIterator<T>, pred: (t: T) => boolean): number {
  let result = 0
  for (let item of iter) {
    if (pred(item)) ++result
  }
  return result
}

export function SerializeJson(src: any): string {
  return JSON.stringify(src, (_, v) => {
    switch (typeof v) {
      case 'bigint':
        return v.toString()
      case 'object':
        if (v === null) {
          return null
        }
        if (v instanceof Map) {
          return Array.from(v.entries())
        }
        if (v instanceof Set) {
          return Array.from(v)
        }
        if (v instanceof Array) {
          return v.map(e => typeof e === 'bigint' ? e.toString() : e)
        }
        return v
      default:
        return v
    }
  })
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
