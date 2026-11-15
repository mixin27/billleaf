import { describe, expect, it } from "vitest"

import { positionAfter, renumber } from "./task-position.js"

const col = [
  { id: "a", position: 1024 },
  { id: "b", position: 2048 },
  { id: "c", position: 3072 },
]

describe("positionAfter", () => {
  it("places first, between, and last", () => {
    expect(positionAfter([], null)).toBe(1024)
    expect(positionAfter(col, null)).toBe(0)
    expect(positionAfter(col, "a")).toBe(1536)
    expect(positionAfter(col, "c")).toBe(4096)
  })

  it("ignores the moving item itself", () => {
    // Moving "b" to right after "a" when b is the next item: between a and c.
    expect(positionAfter(col, "a", "b")).toBe(2048)
  })

  it("signals renumbering when neighbours are too close", () => {
    expect(
      positionAfter(
        [
          { id: "x", position: 1 },
          { id: "y", position: 1 + 1e-9 },
        ],
        "x"
      )
    ).toBeNull()
    expect(renumber([{ id: "x" }, { id: "y" }])).toEqual([
      { id: "x", position: 1024 },
      { id: "y", position: 2048 },
    ])
  })
})
