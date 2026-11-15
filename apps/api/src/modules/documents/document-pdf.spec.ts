import { describe, expect, it } from "vitest"

import { renderDocumentPdf, scriptRuns } from "./document-pdf.js"

describe("scriptRuns", () => {
  it("splits mixed text by script, keeping neutral characters in the current run", () => {
    expect(scriptRuns("Invoice INV-0001")).toEqual([
      { script: "base", text: "Invoice INV-0001" },
    ])
    expect(scriptRuns("Design — ဒီဇိုင်း (v2)")).toEqual([
      { script: "base", text: "Design — " },
      { script: "myanmar", text: "ဒီဇိုင်း (" },
      { script: "base", text: "v2)" },
    ])
    expect(scriptRuns("ออกแบบ logo").map((r) => r.script)).toEqual([
      "thai",
      "base",
    ])
    expect(scriptRuns("Tư vấn — Русский")).toEqual([
      { script: "base", text: "Tư vấn — Русский" },
    ])
  })
})

describe("renderDocumentPdf", () => {
  it("embeds Unicode fonts and survives a corrupt logo", async () => {
    const pdf = await renderDocumentPdf({
      title: "Invoice",
      number: "INV-0001",
      meta: [{ label: "Issued", value: "Nov 15, 2026" }],
      issuer: { name: "Studio", addressLines: [] },
      recipient: { name: "ရွှေမြန်မာ ကုမ္ပဏီ", addressLines: ["กรุงเทพฯ"] },
      currency: "USD",
      locale: "en-US",
      lines: [
        {
          description: "Work",
          quantity: 1,
          unitPrice: 100,
          taxRateBps: 0,
          amount: 100,
        },
      ],
      subtotal: 100,
      taxTotal: 0,
      total: 100,
      logo: Buffer.from("not an image"),
    })
    const text = pdf.toString("latin1")
    expect(text.startsWith("%PDF")).toBe(true)
    expect(text).toContain("NotoSans")
    expect(text).toContain("NotoSansMyanmar")
    expect(text).toContain("NotoSansThai")
  })
})
