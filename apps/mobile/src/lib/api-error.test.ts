import { onlineManager } from "@tanstack/react-query"
import { afterEach, describe, expect, it } from "vitest"

import {
  ApiError,
  errorKind,
  errorMessage,
  isRetryable,
  unwrap,
} from "./api-error"

const res = (status: number) => new Response(null, { status })

describe("unwrap", () => {
  it("returns the data of a 2xx", async () => {
    await expect(
      unwrap(Promise.resolve({ data: { ok: 1 }, response: res(200) }))
    ).resolves.toEqual({ ok: 1 })
  })

  it("throws an ApiError with the problem for a non-2xx", async () => {
    const err = await unwrap(
      Promise.resolve({
        error: { title: "Conflict", code: "timer_running" },
        response: res(409),
      })
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(409)
    expect((err as ApiError).code).toBe("timer_running")
    expect((err as ApiError).message).toBe("Conflict")
  })
})

describe("errorMessage", () => {
  it("prefers the problem detail", () => {
    expect(
      errorMessage(new ApiError(400, { title: "Bad", detail: "Too long" }))
    ).toBe("Too long")
  })

  it("names the first field of a 422", () => {
    const e = new ApiError(422, {
      title: "Invalid",
      errors: [{ path: "description", message: "Too long" }],
    } as never)
    expect(errorMessage(e)).toBe("Description: Too long")
    expect(e.fieldErrors).toEqual({ description: "Too long" })
  })

  it("labels nested fields in words", () => {
    const e = new ApiError(422, {
      errors: [{ path: "lines.0.unitPrice", message: "Required" }],
    } as never)
    expect(errorMessage(e)).toBe("Unit price: Required")
  })

  it("keeps our own messages and hides runtime ones", () => {
    expect(errorMessage(new Error("Pick a book first"))).toBe(
      "Pick a book first"
    )
    expect(errorMessage(new Error("undefined is not an object"))).toBe(
      "Something went wrong. Try again."
    )
    expect(errorMessage("nope")).toBe("Something went wrong. Try again.")
  })
})

describe("connection problems", () => {
  afterEach(() => onlineManager.setOnline(true))
  const dns = new TypeError(
    'fetch failed: java.net.UnknownHostException: Unable to resolve host "api.billleaf.com": No address associated with hostname'
  )

  it("says you're offline when the phone is", () => {
    onlineManager.setOnline(false)
    expect(errorKind(dns)).toBe("offline")
    expect(errorMessage(dns)).toBe(
      "You're offline. Connect to the internet and try again."
    )
  })

  it("says Billleaf can't be reached when the phone is online", () => {
    expect(errorKind(new TypeError("Network request failed"))).toBe(
      "unreachable"
    )
    expect(errorMessage(dns)).not.toMatch(/java|Exception/)
  })

  it("never shows a server fault's internals", () => {
    const e = new ApiError(500, {
      title: "Internal Server Error",
      detail: "pg: deadlock",
    })
    expect(errorMessage(e)).toBe(
      "Something went wrong on Billleaf's side. Try again in a moment."
    )
    expect(isRetryable(e)).toBe(true)
  })

  it.each([
    [401, "session"],
    [403, "forbidden"],
    [404, "notFound"],
    [429, "rateLimited"],
    [504, "timeout"],
  ])("%i is %s", (status, kind) =>
    expect(errorKind(new ApiError(status, {}))).toBe(kind)
  )

  it("doesn't offer Retry for a permission or validation error", () => {
    expect(isRetryable(new ApiError(403, {}))).toBe(false)
    expect(isRetryable(new ApiError(422, {}))).toBe(false)
  })
})
