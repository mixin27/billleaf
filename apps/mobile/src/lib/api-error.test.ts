import { describe, expect, it } from "vitest"

import { ApiError, errorMessage, unwrap } from "./api-error"

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
    expect(errorMessage(e)).toBe("description: Too long")
    expect(e.fieldErrors).toEqual({ description: "Too long" })
  })

  it("falls back for unknown errors", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom")
    expect(errorMessage("nope")).toBe("Something went wrong")
  })
})
