import {
  inlineRuns,
  type PartySnapshot,
  parseContractText,
} from "@workspace/contracts"

import { cjkFontsFor, createPdf, INK, MUTED, RULE } from "./document-pdf.js"

export interface ContractPdfData {
  title: string
  number: string | null
  /** DRAFT / DECLINED / VOID */
  stamp?: string | null
  /** Merge-resolved text (Markdown subset). */
  body: string
  meta: { label: string; value: string }[]
  issuer: PartySnapshot
  client: PartySnapshot
  signature?: { name: string; date: string; electronic?: boolean } | null
  /** Typed-name e-signature evidence, printed on a final page. */
  certificate?: {
    name: string
    email: string
    signedAt: string
    ipAddress: string | null
    userAgent: string | null
    documentHash: string
    consent: string
  } | null
  footer?: string | null
  brandColor?: string | null
  logo?: Buffer | null
  /** Workspace locale: picks the Chinese font style for Han-only text. */
  locale?: string
}

const BOTTOM = 70

/** Render a contract: header, parties, body text, then a signature block. */
export async function renderContractPdf(d: ContractPdfData): Promise<Buffer> {
  const cjk = await cjkFontsFor(d, d.locale)
  const { doc, done, write, left, width } = createPdf(
    `${d.title} ${d.number ?? ""}`.trim(),
    { bufferPages: true, cjk }
  )
  const accent = d.brandColor ?? INK
  const bottom = () => doc.page.height - BOTTOM
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage()
  }

  // Header
  write("CONTRACT", left, 46, {}, { bold: true, size: 11, color: accent })
  write(d.number ?? "Draft", left, 62, {}, { size: 10, color: MUTED })
  if (d.logo) {
    try {
      doc.image(d.logo, left + width - 150, 40, {
        fit: [150, 50],
        align: "right",
      })
    } catch {
      // Unsupported image: render without it.
    }
  }
  if (d.stamp) {
    write(
      d.stamp,
      left,
      d.logo ? 96 : 50,
      { width, align: "right" },
      { bold: true, size: 11, color: "#B42318" }
    )
  }
  write(
    d.title,
    left,
    100,
    { width: width - 160 },
    { bold: true, size: 18, color: INK }
  )

  // Meta row
  let y = doc.y + 12
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
  y += 36
  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .strokeColor(RULE)
    .stroke()
  doc.y = y + 16

  // Body
  /**
   * Write a paragraph honouring bold, italic (slanted) and link runs,
   * flowing across pages. Every run sets each option, since continued
   * text keeps the previous run's.
   */
  const paragraph = (text: string, x: number, w: number, size = 10) => {
    const runs = inlineRuns(text)
    runs.forEach((r, i) => {
      write(
        r.text,
        i === 0 ? x : undefined,
        i === 0 ? doc.y : undefined,
        {
          width: w,
          continued: i < runs.length - 1,
          lineGap: 2,
          oblique: r.italic ? 12 : false,
          underline: Boolean(r.href),
          link: r.href ?? null,
        },
        { bold: r.bold, size, color: r.href ? accent : INK }
      )
    })
  }
  /** A heading's text without its formatting markers. */
  const plain = (text: string) =>
    inlineRuns(text)
      .map((r) => r.text)
      .join("")
  for (const block of parseContractText(d.body)) {
    if (block.type === "heading") {
      ensure(40)
      doc.y += block.level === 1 ? 6 : 4
      write(
        plain(block.text),
        left,
        doc.y,
        { width },
        {
          bold: true,
          size: block.level === 1 ? 15 : block.level === 2 ? 12 : 11,
          color: INK,
        }
      )
      doc.y += 4
    } else if (block.type === "rule") {
      ensure(20)
      doc.y += 6
      doc
        .moveTo(left, doc.y)
        .lineTo(left + width, doc.y)
        .strokeColor(RULE)
        .stroke()
      doc.y += 10
    } else if (block.type === "paragraph") {
      ensure(24)
      paragraph(block.text, left, width)
      doc.y += 8
    } else {
      block.items.forEach((item, i) => {
        ensure(20)
        const marker = block.ordered ? `${i + 1}.` : "•"
        const top = doc.y
        write(marker, left + 4, top, { width: 16 }, { size: 10, color: INK })
        doc.y = top
        paragraph(item, left + 22, width - 22)
        doc.y += 3
      })
      doc.y += 6
    }
  }

  // Signatures
  ensure(130)
  doc.y += 18
  const top = doc.y
  const colW = width / 2 - 16
  const signatureBlock = (
    label: string,
    party: PartySnapshot,
    x: number,
    signed?: { name: string; date: string; electronic?: boolean } | null
  ) => {
    write(label.toUpperCase(), x, top, {}, { size: 8, color: MUTED })
    write(
      party.legalName || party.name,
      x,
      top + 12,
      { width: colW },
      { bold: true, size: 10, color: INK }
    )
    const lineY = top + 62
    if (signed) {
      write(
        `Signed by ${signed.name}`,
        x,
        lineY - 34,
        { width: colW },
        { size: 10, color: INK }
      )
      write(
        `on ${signed.date}`,
        x,
        lineY - 19,
        { width: colW },
        { size: 9, color: MUTED }
      )
    }
    doc
      .moveTo(x, lineY)
      .lineTo(x + colW, lineY)
      .strokeColor(RULE)
      .stroke()
    write(
      signed
        ? signed.electronic
          ? "Signed electronically (see signature certificate)"
          : "Signature recorded"
        : "Signature, name and date",
      x,
      lineY + 4,
      { width: colW },
      { size: 8, color: MUTED }
    )
  }
  signatureBlock("Provider", d.issuer, left)
  signatureBlock("Client", d.client, left + width / 2 + 16, d.signature)

  if (d.certificate) {
    const c = d.certificate
    doc.addPage()
    write(
      "SIGNATURE CERTIFICATE",
      left,
      46,
      {},
      { bold: true, size: 11, color: accent }
    )
    write(
      `${d.title}${d.number ? ` · ${d.number}` : ""}`,
      left,
      66,
      { width },
      { size: 10, color: MUTED }
    )
    let cy = 104
    const row = (label: string, value: string, size = 10) => {
      write(
        label.toUpperCase(),
        left,
        cy,
        { width: 130 },
        { size: 8, color: MUTED }
      )
      write(
        value,
        left + 140,
        cy - 1,
        { width: width - 140 },
        { size, color: INK }
      )
      cy = Math.max(doc.y, cy + 14) + 10
    }
    row("Signed by", c.name)
    row("Email", `${c.email} (verified by a sign-in link sent to this address)`)
    row("Signed at", c.signedAt)
    row("Method", "Typed name in the client portal")
    row("Agreement", `"${c.consent}"`)
    row("IP address", c.ipAddress ?? "Not recorded")
    row("Device", c.userAgent ?? "Not recorded")
    // 64 hex characters: small enough to stay on one line.
    row("Document SHA-256", c.documentHash, 8)
    write(
      "The document fingerprint is the SHA-256 hash of the contract text exactly as it was shown to the signer. Any later change to the text produces a different fingerprint.",
      left,
      cy + 8,
      { width },
      { size: 8, color: MUTED }
    )
  }

  if (d.footer) {
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      doc.page.margins.bottom = 0 // draw inside the margin without a page break
      write(
        d.footer,
        left,
        doc.page.height - 50,
        { width, align: "center", lineBreak: false },
        { size: 8, color: MUTED }
      )
    }
  }
  doc.end()
  return done
}
