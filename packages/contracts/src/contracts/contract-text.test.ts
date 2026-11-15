import { describe, expect, it } from "vitest"

import {
  inlineRuns,
  parseContractText,
  renderMergeFields,
  SAMPLE_CONTRACT_TEMPLATE,
  unresolvedFields,
} from "./contract-text.js"

describe("merge fields", () => {
  it("resolves known fields with values and reports the rest", () => {
    const text = "Hi {{ client.name }}, ref {{quote.number}}, {{bogus.field}}"
    const values = { "client.name": "Acme", "quote.number": null }
    expect(renderMergeFields(text, values)).toBe(
      "Hi Acme, ref {{quote.number}}, {{bogus.field}}"
    )
    expect(unresolvedFields(text, values)).toEqual([
      "quote.number",
      "bogus.field",
    ])
  })

  it("only uses fields the sample can resolve with a quote linked", () => {
    const keys = unresolvedFields(SAMPLE_CONTRACT_TEMPLATE.body, {})
    expect(keys.sort()).toEqual(
      [
        "business.legal_name",
        "client.legal_name",
        "contract.effective_date",
        "quote.number",
        "quote.total",
        "today",
      ].sort()
    )
  })
})

describe("parseContractText", () => {
  it("parses headings, paragraphs with line breaks, and both list kinds", () => {
    const blocks = parseContractText(
      "# Title\n\nLine one\nline two\n\n- a\n- b\n  continued\n1. one\n2) two\nAfter"
    )
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "paragraph", text: "Line one\nline two" },
      { type: "list", ordered: false, items: ["a", "b\ncontinued"] },
      { type: "list", ordered: true, items: ["one", "two"] },
      { type: "paragraph", text: "After" },
    ])
  })

  it("splits bold runs", () => {
    expect(inlineRuns("a **b** c **d")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c **d", bold: false },
    ])
  })
})
