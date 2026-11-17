import { copyFileSync, existsSync, mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { cjkLangFor } from "./cjk-fonts.js"
import { renderDocumentPdf, scriptRuns } from "./document-pdf.js"

describe("cjkLangFor", () => {
  it("is null without CJK text", () => {
    expect(cjkLangFor("Invoice — ဒီဇိုင်း ออกแบบ Русский")).toBeNull()
  })
  it("picks Japanese for kana and Korean for Hangul", () => {
    expect(cjkLangFor("デザイン料 東京")).toBe("jp")
    expect(cjkLangFor("서울 디자인")).toBe("kr")
  })
  it("follows the locale for Chinese characters alone", () => {
    expect(cjkLangFor("设计费 北京")).toBe("sc")
    expect(cjkLangFor("設計費 台北", "zh-TW")).toBe("tc")
    expect(cjkLangFor("設計費", "zh-Hant-HK")).toBe("tc")
    expect(cjkLangFor("東京", "ja-JP")).toBe("jp")
    expect(cjkLangFor("漢字", "ko-KR")).toBe("kr")
    expect(cjkLangFor("设计", "en-US")).toBe("sc")
  })
})

describe("scriptRuns with CJK", () => {
  it("splits CJK from Latin and keeps fullwidth punctuation with it", () => {
    expect(scriptRuns("Logo 设计（v2）")).toEqual([
      { script: "base", text: "Logo " },
      { script: "cjk", text: "设计（" },
      { script: "base", text: "v2" },
      // Fullwidth punctuation needs the CJK font too.
      { script: "cjk", text: "）" },
    ])
  })
})

const invoice = (recipient: string, line: string, locale = "en-US") =>
  renderDocumentPdf({
    title: "Invoice",
    number: "INV-0001",
    meta: [{ label: "Issued", value: "Nov 17, 2026" }],
    issuer: { name: "Studio", addressLines: [] },
    recipient: { name: recipient, addressLines: ["東京都渋谷区"] },
    currency: "JPY",
    locale,
    lines: [
      {
        description: line,
        quantity: 1,
        unitPrice: 50_000,
        taxRateBps: 1000,
        amount: 50_000,
      },
    ],
    subtotal: 50_000,
    taxTotal: 5_000,
    total: 55_000,
  })

describe("CJK fonts in PDFs", () => {
  const original = process.env.PDF_FONT_CACHE_DIR
  afterEach(() => {
    process.env.PDF_FONT_CACHE_DIR = original
    vi.unstubAllGlobals()
  })

  it("still renders (without CJK glyphs) when the font can't be fetched", async () => {
    process.env.PDF_FONT_CACHE_DIR = mkdtempSync(join(tmpdir(), "fonts-"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      })
    )
    const pdf = await invoice("株式会社テスト", "ロゴデザイン")
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF")
    expect(pdf.includes("NotoSansJP")).toBe(false)
  })

  it("refuses a font whose checksum doesn't match", async () => {
    process.env.PDF_FONT_CACHE_DIR = mkdtempSync(join(tmpdir(), "fonts-"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(Buffer.from("not a font")))
    )
    const pdf = await invoice("서울 주식회사", "디자인")
    expect(pdf.includes("NotoSansKR")).toBe(false)
  })

  // With real fonts (set CJK_FONT_SAMPLE_DIR to a folder of the release's
  // .otf files): embedded as small subsets, the right one per language.
  const samples = process.env.CJK_FONT_SAMPLE_DIR
  it.skipIf(!samples || !existsSync(samples))(
    "embeds subsets of the fetched fonts",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "fonts-"))
      for (const f of readdirSync(samples!)) {
        const lang = /NotoSans(SC|TC|JP|KR)-/.exec(f)?.[1]
        if (lang) copyFileSync(join(samples!, f), join(dir, `${lang}-${f}`))
      }
      process.env.PDF_FONT_CACHE_DIR = dir
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("should use the cache")
        })
      )
      const jp = await invoice("株式会社テスト", "ロゴデザイン")
      expect(jp.includes("NotoSansJP-Regular")).toBe(true)
      expect(jp.length).toBeLessThan(400_000)
      const tc = await invoice("台北設計", "設計費", "zh-TW")
      expect(tc.includes("NotoSansTC")).toBe(true)
      const kr = await invoice("서울 주식회사", "디자인")
      expect(kr.includes("NotoSansKR")).toBe(true)
    }
  )
})
