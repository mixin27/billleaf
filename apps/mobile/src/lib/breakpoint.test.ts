import { describe, expect, it } from "vitest"

import { breakpointFor } from "./breakpoint"

describe("breakpointFor", () => {
  it.each([
    [360, "compact"],
    [599, "compact"],
    [600, "medium"],
    [834, "medium"],
    [840, "expanded"],
    [1194, "expanded"],
  ])("%i → %s", (w, bp) => expect(breakpointFor(w)).toBe(bp))
})
