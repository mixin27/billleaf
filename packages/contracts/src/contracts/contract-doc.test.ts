import { describe, expect, it } from "vitest"

import { type DocNode, docToMarkdown, markdownToDoc } from "./contract-doc.js"
import {
  inlineRuns,
  parseContractText,
  SAMPLE_CONTRACT_TEMPLATE,
} from "./contract-text.js"

const roundTrip = (text: string) => docToMarkdown(markdownToDoc(text))

describe("inline formatting", () => {
  it("reads italic, links and escapes", () => {
    expect(
      inlineRuns("an _aside_, a [site](https://example.com) and \\*stars\\*")
    ).toEqual([
      { text: "an ", bold: false },
      { text: "aside", bold: false, italic: true },
      { text: ", a ", bold: false },
      { text: "site", bold: false, href: "https://example.com" },
      { text: " and *stars*", bold: false },
    ])
  })

  it("nests italic inside bold", () => {
    expect(inlineRuns("**all _of_ it**")).toEqual([
      { text: "all ", bold: true },
      { text: "of", bold: true, italic: true },
      { text: " it", bold: true },
    ])
  })

  it("leaves plain text that only looks like formatting alone", () => {
    for (const text of [
      "snake_case_name and {{client.legal_name}}",
      "Signature: ______________",
      "2 * 3 * 4",
      "[not a link](javascript:alert(1))",
      "C:\\path\\to",
    ])
      expect(inlineRuns(text)).toEqual([{ text, bold: false }])
  })

  it("reads a dash line as a rule", () => {
    expect(parseContractText("Above\n\n---\n\nBelow")).toEqual([
      { type: "paragraph", text: "Above" },
      { type: "rule" },
      { type: "paragraph", text: "Below" },
    ])
  })
})

describe("markdownToDoc / docToMarkdown", () => {
  it("round-trips the sample template to the same document", () => {
    const body = SAMPLE_CONTRACT_TEMPLATE.body
    const once = roundTrip(body)
    // Same blocks and runs; only blank lines are normalised, once.
    expect(parseContractText(once)).toEqual(parseContractText(body))
    expect(roundTrip(once)).toBe(once)
  })

  it("round-trips every construct", () => {
    const text = [
      "# Title",
      "Made on {{today}} between **{{business.name}}** and _{{client.name}}_.\nSecond line.",
      "## Terms",
      "- one with a [link](https://example.com)\n  continued\n- **two**",
      "1. first\n2. second",
      "---",
      "Literal \\*stars\\*, snake_case and a \\_lone underscore.",
    ].join("\n\n")
    expect(roundTrip(text)).toBe(text)
  })

  it("turns merge fields into their own nodes", () => {
    const doc = markdownToDoc("Hi {{client.name}}!")
    expect(doc.content?.[0]?.content).toEqual([
      { type: "text", text: "Hi " },
      { type: "mergeField", attrs: { key: "client.name" } },
      { type: "text", text: "!" },
    ])
  })

  it("writes editor documents the parser reads back the same", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "- not a list, " },
            { type: "text", text: "bold ", marks: [{ type: "bold" }] },
            {
              type: "text",
              text: "both",
              marks: [{ type: "bold" }, { type: "italic" }],
            },
            { type: "text", text: " 2*3" },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "a" }] },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "nested" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const text = docToMarkdown(doc)
    expect(text).toBe("\\- not a list, **bold _both_** 2\\*3\n\n- a\n- nested")
    expect(parseContractText(text)[0]).toEqual({
      type: "paragraph",
      text: "\\- not a list, **bold _both_** 2\\*3",
    })
    expect(inlineRuns("\\- not a list, **bold _both_** 2\\*3")).toEqual([
      { text: "- not a list, ", bold: false },
      { text: "bold ", bold: true },
      { text: "both", bold: true, italic: true },
      { text: " 2*3", bold: false },
    ])
  })

  it("gives an empty document one empty paragraph", () => {
    expect(markdownToDoc("")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    })
    expect(docToMarkdown(markdownToDoc(""))).toBe("")
  })
})
