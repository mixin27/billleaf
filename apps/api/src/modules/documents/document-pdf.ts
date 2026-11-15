import { formatMoney, type PartySnapshot } from "@workspace/contracts"
import PDFDocument from "pdfkit"

export interface DocumentPdfData {
  /** "Invoice" | "Quote" — the document heading. */
  title: string
  number: string | null
  /** Watermark-style label for non-final states, e.g. DRAFT, VOID. */
  stamp?: string | null
  meta: { label: string; value: string }[]
  issuer: PartySnapshot
  recipient: PartySnapshot
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
  amountDue?: number
  notes?: string | null
  terms?: string | null
  footer?: string | null
  brandColor?: string | null
}

const INK = "#142B2B"
const MUTED = "#5B6B6B"
const RULE = "#DDE5E2"

/**
 * Render a quote/invoice as an A4 PDF.
 *
 * Uses the built-in Helvetica (Latin-1). Names in non-Latin scripts
 * (e.g. Thai, Burmese) need an embedded Unicode font — tracked as a follow-up.
 */
export function renderDocumentPdf(d: DocumentPdfData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: { Title: `${d.title} ${d.number ?? ""}`.trim() },
  })
  const chunks: Buffer[] = []
  doc.on("data", (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  )

  const accent = d.brandColor ?? INK
  const money = (amount: number) => {
    try {
      return formatMoney({ amount, currency: d.currency }, d.locale)
    } catch {
      return formatMoney({ amount, currency: d.currency })
    }
  }
  const left = doc.page.margins.left
  const width = doc.page.width - left - doc.page.margins.right

  // Header
  doc
    .fillColor(accent)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(d.title.toUpperCase(), left, 50)
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(10)
    .text(d.number ?? "Draft", left, 78)
  if (d.stamp) {
    doc
      .fillColor("#B42318")
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(d.stamp, left, 50, { width, align: "right" })
  }

  // Parties
  const partyTop = 115
  const party = (label: string, p: PartySnapshot, x: number) => {
    let y = partyTop
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(label.toUpperCase(), x, y)
    y += 12
    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(p.legalName || p.name, x, y, { width: width / 2 - 10 })
    y = doc.y + 2
    doc.font("Helvetica").fontSize(9)
    for (const line of [
      ...p.addressLines,
      p.email,
      p.phone,
      p.taxId ? `Tax ID ${p.taxId}` : null,
    ]) {
      if (!line) continue
      doc.text(line, x, y, { width: width / 2 - 10 })
      y = doc.y + 1
    }
    return y
  }
  const y1 = party("From", d.issuer, left)
  const y2 = party("Bill to", d.recipient, left + width / 2)
  let y = Math.max(y1, y2) + 16

  // Meta row
  const metaW = width / Math.max(1, d.meta.length)
  d.meta.forEach((m, i) => {
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(m.label.toUpperCase(), left + i * metaW, y)
    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(m.value, left + i * metaW, y + 11)
  })
  y += 40

  // Lines table
  const cols = {
    desc: left,
    qty: left + width * 0.55,
    price: left + width * 0.65,
    tax: left + width * 0.8,
    amt: left + width * 0.87,
  }
  const header = (yy: number) => {
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8)
    doc.text("DESCRIPTION", cols.desc, yy)
    doc.text("QTY", cols.qty, yy, { width: width * 0.09, align: "right" })
    doc.text("UNIT PRICE", cols.price, yy, {
      width: width * 0.14,
      align: "right",
    })
    doc.text("TAX", cols.tax, yy, { width: width * 0.06, align: "right" })
    doc.text("AMOUNT", cols.amt, yy, { width: width * 0.13, align: "right" })
    doc
      .moveTo(left, yy + 13)
      .lineTo(left + width, yy + 13)
      .strokeColor(RULE)
      .stroke()
    return yy + 20
  }
  y = header(y)
  doc.font("Helvetica").fontSize(9).fillColor(INK)
  for (const l of d.lines) {
    const h = doc.heightOfString(l.description, { width: width * 0.53 })
    if (y + h > doc.page.height - 140) {
      doc.addPage()
      y = header(50)
      doc.font("Helvetica").fontSize(9).fillColor(INK)
    }
    doc.text(l.description, cols.desc, y, { width: width * 0.53 })
    doc.text(String(l.quantity), cols.qty, y, {
      width: width * 0.09,
      align: "right",
    })
    doc.text(money(l.unitPrice), cols.price, y, {
      width: width * 0.14,
      align: "right",
    })
    doc.text(l.taxRateBps ? `${l.taxRateBps / 100}%` : "—", cols.tax, y, {
      width: width * 0.06,
      align: "right",
    })
    doc.text(money(l.amount), cols.amt, y, {
      width: width * 0.13,
      align: "right",
    })
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
    doc
      .fillColor(bold ? INK : MUTED)
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(bold ? 11 : 9)
    doc.text(label, totalsX, y, { width: width * 0.25 })
    doc
      .fillColor(INK)
      .text(value, totalsX, y, { width: width * 0.45, align: "right" })
    y += bold ? 18 : 14
  }
  totalRow("Subtotal", money(d.subtotal))
  totalRow("Tax", money(d.taxTotal))
  totalRow(`Total (${d.currency})`, money(d.total), true)
  if (d.amountPaid !== undefined && d.amountPaid > 0)
    totalRow("Paid", money(d.amountPaid))
  if (d.amountDue !== undefined)
    totalRow("Amount due", money(d.amountDue), true)
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
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(label.toUpperCase(), left, y)
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(9)
      .text(text, left, y + 11, { width })
    y = doc.y + 12
  }
  if (d.footer) {
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(d.footer, left, doc.page.height - 80, { width, align: "center" })
  }

  doc.end()
  return done
}
