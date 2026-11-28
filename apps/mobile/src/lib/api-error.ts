import { onlineManager } from "@tanstack/react-query"
import type { Problem } from "@workspace/contracts"

// ApiError / unwrap: same as apps/web/lib/api.ts. errorMessage adds the
// phone's cases (offline, unreachable) and never shows a raw exception.

/** Error thrown for any non-2xx API response (RFC 9457 problem details). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Partial<Problem> | undefined
  ) {
    super(problem?.detail ?? problem?.title ?? `Request failed (${status})`)
    this.name = "ApiError"
  }

  get code() {
    return this.problem?.code
  }

  /** Field errors from a 422, keyed by dotted path. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      (this.problem?.errors ?? []).map((e) => [e.path, e.message])
    )
  }
}

/** Unwrap an openapi-fetch result or throw an ApiError. */
export async function unwrap<
  R extends { data?: unknown; error?: unknown; response: Response },
>(promise: Promise<R>): Promise<NonNullable<R["data"]>> {
  const { data, error, response } = await promise
  if (error !== undefined || !response.ok) {
    throw new ApiError(response.status, error as Partial<Problem> | undefined)
  }
  return data as NonNullable<R["data"]>
}

export type ErrorKind =
  | "offline"
  | "unreachable"
  | "timeout"
  | "session"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "validation"
  | "rateLimited"
  | "server"
  | "unknown"

/** What fetch throws when the request never got an answer. */
const NETWORK =
  /network request failed|fetch failed|failed to fetch|unknownhost|unable to resolve host|enotfound|eai_again|econnrefused|econnreset|failed to connect|could not connect|connection (was lost|abort|reset|refused)|internet connection appears to be offline|no address associated|software caused connection abort|ssl|socket/i
const TIMEOUT = /timed? ?out|timeout/i
/** Messages from the runtime, not from us or the API. */
const TECHNICAL =
  /exception|java\.|kotlin\.|objc|undefined|null is not|is not a function|cannot read|unexpected token|json parse|\bat .+:\d+/i

/** Sort an error into what the person can do about it. */
export function errorKind(error: unknown): ErrorKind {
  if (error instanceof ApiError) {
    const s = error.status
    if (s === 401) return "session"
    if (s === 403) return "forbidden"
    if (s === 404 || s === 410) return "notFound"
    if (s === 408 || s === 504) return "timeout"
    if (s === 409) return "conflict"
    if (s === 400 || s === 422) return "validation"
    if (s === 429) return "rateLimited"
    if (s >= 500) return "server"
    return "unknown"
  }
  const text = error instanceof Error ? `${error.name} ${error.message}` : ""
  if (error instanceof Error && error.name === "AbortError") return "timeout"
  if (NETWORK.test(text))
    return onlineManager.isOnline() ? "unreachable" : "offline"
  if (TIMEOUT.test(text)) return "timeout"
  return "unknown"
}

/** Can trying again help (a Retry button makes sense)? */
export function isRetryable(error: unknown): boolean {
  const k = errorKind(error)
  return (
    k === "offline" ||
    k === "unreachable" ||
    k === "timeout" ||
    k === "server" ||
    k === "rateLimited" ||
    k === "unknown"
  )
}

/** "lines.0.unitPrice" → "Unit price". */
function fieldLabel(path: string) {
  const last =
    path
      .split(".")
      .filter((p) => !/^\d+$/.test(p))
      .pop() ?? path
  const words = last.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

/**
 * A message a person can act on, for toasts, alerts and error states. The
 * API's own messages are written for people and kept; connection problems
 * and server faults get plain words instead of the raw exception.
 */
export function errorMessage(error: unknown): string {
  const kind = errorKind(error)
  const api = error instanceof ApiError ? error : null
  const detail = api?.problem?.detail ?? api?.problem?.title
  switch (kind) {
    case "offline":
      return "You're offline. Connect to the internet and try again."
    case "unreachable":
      return "Can't reach Billleaf. Check your connection and try again."
    case "timeout":
      return "Billleaf took too long to answer. Try again."
    case "session":
      return "Your session has ended. Sign in again."
    case "forbidden":
      return detail ?? "Your role doesn't allow this."
    case "notFound":
      return detail ?? "It was deleted or moved."
    case "rateLimited":
      return "Too many tries. Wait a moment and try again."
    case "server":
      return "Something went wrong on Billleaf's side. Try again in a moment."
    case "validation": {
      const first = api?.problem?.errors?.[0]
      if (first) return `${fieldLabel(first.path)}: ${first.message}`
      return detail ?? "Please check the form."
    }
    case "conflict":
      return detail ?? "Someone changed this just now. Refresh and try again."
    default: {
      if (api) return detail ?? "Something went wrong. Try again."
      const msg = error instanceof Error ? error.message : ""
      return msg && !TECHNICAL.test(msg)
        ? msg
        : "Something went wrong. Try again."
    }
  }
}
