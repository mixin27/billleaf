import { describe, expect, it } from "vitest"

import { toCsv } from "./workspace-data.service.js"

describe("toCsv", () => {
  it("is empty without rows", () => {
    expect(toCsv([])).toBe("")
  })

  it("writes snake_case headers, ISO dates, JSON objects and quoted cells", () => {
    const csv = toCsv([
      {
        id: "a",
        createdAt: new Date("2026-11-15T10:00:00Z"),
        name: 'Quote "Heavy", Ltd',
        address: { city: "Yangon" },
        note: null,
        lines: "one\ntwo",
      },
    ])
    expect(csv).toBe(
      'id,created_at,name,address,note,lines\r\na,2026-11-15T10:00:00.000Z,"Quote ""Heavy"", Ltd","{""city"":""Yangon""}",,"one\ntwo"\r\n'
    )
  })
})
