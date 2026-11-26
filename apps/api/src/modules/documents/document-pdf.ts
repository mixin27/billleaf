import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { formatMoney, type PartySnapshot } from "@workspace/contracts"
import PDFDocument from "pdfkit"

import { CJK, cjkFonts, cjkLangFor } from "./cjk-fonts.js"

export interface DocumentPdfData {
  /** "Invoice" | "Quote" | "Receipt" — the document heading. */
  title: string
  number: string | null
  /** Status stamp for non-final states, e.g. DRAFT, VOID, PAID. */
  stamp?: string | null
  meta: { label: string; value: string }[]
  issuer: PartySnapshot
  recipient: PartySnapshot
  /** Heading above the recipient block (default "Bill to"). */
  recipientLabel?: string
  currency: string
  locale: string
  lines: {
    description: string
    quantity: number
    unitPrice: number
    taxRateBps: number
    amount: number
  }[]
  subtotal: number
  taxTotal: number
  total: number
  /** Invoices: amount already paid and balance due. */
  amountPaid?: number
  /** Invoices: issued credit notes applied to the balance. */
  amountCredited?: number
  amountDue?: number
  /** Replace the standard Subtotal/Tax/Total block (e.g. receipts). */
  totals?: { label: string; amount: number; bold?: boolean }[]
  /** Invoices with a balance: how to pay (bank accounts, wallets, QR). */
  paymentInstructions?: {
    label: string
    lines: string[]
    qr?: Buffer | null
  }[]
  notes?: string | null
  terms?: string | null
  footer?: string | null
  brandColor?: string | null
  /** PNG or JPEG bytes, drawn top-right. */
  logo?: Buffer | null
}

export const INK = "#142B2B"
export const MUTED = "#5B6B6B"
export const RULE = "#DDE5E2"

// ── Fonts ────────────────────────────────────────────────────────────────
// Noto Sans (Latin, Greek, Cyrillic, Vietnamese) + Thai + Myanmar, OFL-1.1.
// apps/api/assets/fonts, resolved relative to this file in src/ and dist/.
// Chinese/Japanese/Korean ("cjk") are fetched on first use: see cjk-fonts.ts.
type Script = "base" | "thai" | "myanmar" | "cjk"
const FONT_DIR = fileURLToPath(
  new URL("../../../assets/fonts/", import.meta.url)
)
const FONT_FILES: Record<
  Exclude<Script, "cjk">,
  { regular: string; bold: string }
> = {
  base: { regular: "NotoSans_400Regular.ttf", bold: "NotoSans_700Bold.ttf" },
  thai: {
    regular: "NotoSansThai_400Regular.ttf",
    bold: "NotoSansThai_700Bold.ttf",
  },
  myanmar: {
    regular: "NotoSansMyanmar_400Regular.ttf",
    bold: "NotoSansMyanmar_700Bold.ttf",
  },
}
let fontCache: Record<string, Buffer> | null = null
function fonts(): Record<string, Buffer> {
  if (!fontCache) {
    fontCache = {}
    for (const [script, f] of Object.entries(FONT_FILES)) {
      fontCache[`${script}`] = readFileSync(FONT_DIR + f.regular)
      fontCache[`${script}-bold`] = readFileSync(FONT_DIR + f.bold)
    }
  }
  return fontCache
}

/**
 * The CJK fonts a document's text needs (looked up from all its strings),
 * or null when it has none or they can't be fetched.
 */
export async function cjkFontsFor(data: unknown, locale?: string) {
  const text = JSON.stringify(data, (_k, v: unknown) =>
    Buffer.isBuffer(v) ||
    (v && typeof v === "object" && (v as { type?: string }).type === "Buffer")
      ? undefined
      : v
  )
  const lang = cjkLangFor(text ?? "", locale)
  return lang ? cjkFonts(lang) : null
}

const THAI = /[฀-๿]/
const MYANMAR = /[က-႟ꧠ-꧿ꩠ-ꩿ]/
// Characters that belong to whichever script surrounds them.
const NEUTRAL = /[\s\d.,:;!?'"()[\]{}\-–—/\\&@#%+*=<>|·•]/

function scriptOf(ch: string): Script | null {
  if (CJK.test(ch)) return "cjk"
  if (THAI.test(ch)) return "thai"
  if (MYANMAR.test(ch)) return "myanmar"
  if (NEUTRAL.test(ch)) return null
  return "base"
}

/** Split text into runs of a single script (neutral chars join the current run). */
export function scriptRuns(text: string): { script: Script; text: string }[] {
  const runs: { script: Script; text: string }[] = []
  for (const ch of text) {
    const s = scriptOf(ch) ?? runs[runs.length - 1]?.script ?? "base"
    const last = runs[runs.length - 1]
    if (last && last.script === s) last.text += ch
    else runs.push({ script: s, text: ch })
  }
  return runs
}

export type WriteStyle = { bold?: boolean; size?: number; color?: string }

/**
 * A4 document with the Unicode fonts registered and a script-aware `write`
 * (switches font per Latin/Thai/Myanmar run so mixed text renders).
 */
export function createPdf(
  title: string,
  opts: {
    bufferPages?: boolean
    /** Chinese/Japanese/Korean fonts (see `cjkFontsFor`); null = none. */
    cjk?: { regular: Buffer; bold: Buffer } | null
  } = {}
) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: { Title: title },
    bufferPages: opts.bufferPages ?? false,
  })
  for (const [name, data] of Object.entries(fonts()))
    doc.registerFont(name, data)
  if (opts.cjk) {
    doc.registerFont("cjk", opts.cjk.regular)
    doc.registerFont("cjk-bold", opts.cjk.bold)
  }
  // Without CJK fonts those runs fall back to the base font (boxes).
  const has = (s: Script) => s !== "cjk" || Boolean(opts.cjk)
  const chunks: Buffer[] = []
  doc.on("data", (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  )

  type TextOpts = PDFKit.Mixins.TextOptions
  /** Write text, switching font per script run. Omit x/y to continue the flow. */
  const write = (
    text: string,
    x: number | undefined,
    y: number | undefined,
    opts: TextOpts = {},
    style: WriteStyle = {}
  ) => {
    if (style.size) doc.fontSize(style.size)
    if (style.color) doc.fillColor(style.color)
    const runs = scriptRuns(text)
    const font = (s: Script) => {
      const f = has(s) ? s : "base"
      return style.bold ? `${f}-bold` : f
    }
    if (runs.length <= 1) {
      doc.font(font(runs[0]?.script ?? "base"))
      if (x === undefined) doc.text(text, opts)
      else doc.text(text, x, y, opts)
      return
    }
    runs.forEach((r, i) => {
      doc.font(font(r.script))
      const continued = i < runs.length - 1 || Boolean(opts.continued)
      if (i === 0 && x !== undefined)
        doc.text(r.text, x, y, { ...opts, continued })
      else doc.text(r.text, { ...opts, continued })
    })
  }
  const heightOf = (text: string, w: number) => {
    const scripts = new Set(scriptRuns(text).map((r) => r.script))
    doc.font(
      scripts.has("myanmar") || scripts.has("thai")
        ? "myanmar"
        : scripts.has("cjk") && has("cjk")
          ? "cjk"
          : "base"
    )
    return doc.heightOfString(text, { width: w })
  }
  const left = doc.page.margins.left
  const width = doc.page.width - left - doc.page.margins.right
  return { doc, done, write, heightOf, left, width }
}

/**
 * Render a quote/invoice/receipt as an A4 PDF with embedded Unicode fonts
 * (so Thai/Burmese/Vietnamese names render) and the workspace logo.
 */
export async function renderDocumentPdf(d: DocumentPdfData): Promise<Buffer> {
  const cjk = await cjkFontsFor(d, d.locale)
  const { doc, done, write, heightOf, left, width } = createPdf(
    `${d.title} ${d.number ?? ""}`.trim(),
    { cjk }
  )
  type TextOpts = PDFKit.Mixins.TextOptions

  const accent = d.brandColor ?? INK
  const money = (amount: number) => {
    try {
      return formatMoney({ amount, currency: d.currency }, d.locale)
    } catch {
      return formatMoney({ amount, currency: d.currency })
    }
  }
  // Header: title + number left, logo (or stamp) right.
  write(
    d.title.toUpperCase(),
    left,
    46,
    {},
    { bold: true, size: 22, color: accent }
  )
  write(d.number ?? "Draft", left, 78, {}, { size: 10, color: MUTED })
  let logoDrawn = false
  if (d.logo) {
    try {
      doc.image(d.logo, left + width - 150, 40, {
        fit: [150, 50],
        align: "right",
      })
      logoDrawn = true
    } catch {
      // Unsupported/corrupt image: render the document without it.
    }
  }
  if (d.stamp) {
    write(
      d.stamp,
      left,
      logoDrawn ? 96 : 50,
      { width, align: "right" },
      { bold: true, size: 11, color: "#B42318" }
    )
  }

  // Parties
  const partyTop = 120
  const party = (label: string, p: PartySnapshot, x: number) => {
    const w = width / 2 - 10
    let y = partyTop
    write(label.toUpperCase(), x, y, {}, { size: 8, color: MUTED })
    y += 12
    write(
      p.legalName || p.name,
      x,
      y,
      { width: w },
      { bold: true, size: 10, color: INK }
    )
    y = doc.y + 2
    for (const line of [
      ...p.addressLines,
      p.email,
      p.phone,
      p.taxId ? `Tax ID ${p.taxId}` : null,
    ]) {
      if (!line) continue
      write(line, x, y, { width: w }, { size: 9, color: INK })
      y = doc.y + 1
    }
    return y
  }
  const y1 = party("From", d.issuer, left)
  const y2 = party(d.recipientLabel ?? "Bill to", d.recipient, left + width / 2)
  let y = Math.max(y1, y2) + 16

  // Meta row
  const metaW = width / Math.max(1, d.meta.length)
  d.meta.forEach((m, i) => {
    write(
      m.label.toUpperCase(),
      left + i * metaW,
      y,
      {},
      { size: 8, color: MUTED }
    )
    write(
      m.value,
      left + i * metaW,
      y + 11,
      { width: metaW - 8 },
      { bold: true, size: 10, color: INK }
    )
  })
  y += 40

  // Lines table
  // Column widths as a share of the line. The money columns fit a
  // 10-digit amount ("MMK 1,250,000,000", "$1,250,000.00") on one line.
  const w = { desc: 0.44, qty: 0.07, price: 0.18, tax: 0.07, amt: 0.19 }
  const cols = {
    desc: left,
    qty: left + width * 0.46,
    price: left + width * 0.54,
    tax: left + width * 0.73,
    amt: left + width * 0.81,
  }
  const right = (w: number): TextOpts => ({ width: width * w, align: "right" })
  const header = (yy: number) => {
    const s = { bold: true, size: 8, color: MUTED }
    write("DESCRIPTION", cols.desc, yy, {}, s)
    write("QTY", cols.qty, yy, right(w.qty), s)
    write("UNIT PRICE", cols.price, yy, right(w.price), s)
    if (!d.totals) write("TAX", cols.tax, yy, right(w.tax), s)
    write("AMOUNT", cols.amt, yy, right(w.amt), s)
    doc
      .moveTo(left, yy + 13)
      .lineTo(left + width, yy + 13)
      .strokeColor(RULE)
      .stroke()
    return yy + 20
  }
  y = header(y)
  const cell = { size: 9, color: INK }
  for (const l of d.lines) {
    doc.fontSize(9)
    const h = heightOf(l.description, width * w.desc)
    if (y + h > doc.page.height - 140) {
      doc.addPage()
      y = header(50)
    }
    write(l.description, cols.desc, y, { width: width * w.desc }, cell)
    write(String(l.quantity), cols.qty, y, right(w.qty), cell)
    write(money(l.unitPrice), cols.price, y, right(w.price), cell)
    if (!d.totals)
      write(
        l.taxRateBps ? `${l.taxRateBps / 100}%` : "—",
        cols.tax,
        y,
        right(w.tax),
        cell
      )
    write(money(l.amount), cols.amt, y, right(w.amt), cell)
    y += Math.max(h, 12) + 8
  }
  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .strokeColor(RULE)
    .stroke()
  y += 10

  // Totals
  const totalsX = left + width * 0.55
  const totalRow = (label: string, value: string, bold = false) => {
    const size = bold ? 11 : 9
    write(
      label,
      totalsX,
      y,
      { width: width * 0.25 },
      { bold, size, color: bold ? INK : MUTED }
    )
    write(
      value,
      totalsX,
      y,
      { width: width * 0.45, align: "right" },
      { bold, size, color: INK }
    )
    y += bold ? 18 : 14
  }
  if (d.totals) {
    for (const t of d.totals) totalRow(t.label, money(t.amount), t.bold)
  } else {
    totalRow("Subtotal", money(d.subtotal))
    totalRow("Tax", money(d.taxTotal))
    totalRow(`Total (${d.currency})`, money(d.total), true)
    if (d.amountPaid !== undefined && d.amountPaid > 0)
      totalRow("Paid", money(d.amountPaid))
    if (d.amountCredited !== undefined && d.amountCredited > 0)
      totalRow("Credited", money(d.amountCredited))
    if (d.amountDue !== undefined)
      totalRow("Amount due", money(d.amountDue), true)
  }
  y += 10

  // Notes, terms, footer
  for (const [label, text] of [
    ["Notes", d.notes],
    ["Terms", d.terms],
  ] as const) {
    if (!text) continue
    if (y > doc.page.height - 120) {
      doc.addPage()
      y = 50
    }
    write(
      label.toUpperCase(),
      left,
      y,
      {},
      { bold: true, size: 8, color: MUTED }
    )
    write(text, left, y + 11, { width }, { size: 9, color: INK })
    y = doc.y + 12
  }
  // How to pay: one block per account, QR image on the right.
  if (d.paymentInstructions?.length) {
    const QR = 72
    if (y > doc.page.height - 160) {
      doc.addPage()
      y = 50
    }
    write("HOW TO PAY", left, y, {}, { bold: true, size: 8, color: MUTED })
    y += 14
    for (const m of d.paymentInstructions) {
      const textWidth = m.qr ? width - QR - 16 : width
      const blockTop = y
      if (blockTop > doc.page.height - (m.qr ? QR + 40 : 80)) {
        doc.addPage()
        y = 50
      }
      const top = y
      write(
        m.label,
        left,
        top,
        { width: textWidth },
        { bold: true, size: 9.5, color: INK }
      )
      let ty = doc.y + 2
      for (const line of m.lines) {
        write(line, left, ty, { width: textWidth }, { size: 9, color: INK })
        ty = doc.y + 1
      }
      let bottom = ty
      if (m.qr) {
        try {
          doc.image(m.qr, left + width - QR, top, { fit: [QR, QR] })
          bottom = Math.max(bottom, top + QR)
        } catch {
          // Unsupported image: the text instructions still show.
        }
      }
      y = bottom + 12
    }
  }

  if (d.footer) {
    write(
      d.footer,
      left,
      doc.page.height - 80,
      { width, align: "center" },
      { size: 8, color: MUTED }
    )
  }

  doc.end()
  return done
}
