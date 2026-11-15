/**
 * Contract text: plain text with a tiny Markdown subset and {{merge.fields}}.
 * Shared by the API (PDF, freezing at send) and the web (editor preview), so
 * both render exactly the same document.
 */

export const MERGE_FIELDS = [
  { key: "client.name", label: "Client name" },
  { key: "client.legal_name", label: "Client legal name (falls back to name)" },
  { key: "client.email", label: "Client email" },
  { key: "client.address", label: "Client address (one line)" },
  { key: "client.tax_id", label: "Client tax ID" },
  { key: "business.name", label: "Your business name" },
  { key: "business.legal_name", label: "Your legal name (falls back to name)" },
  { key: "business.email", label: "Your email" },
  { key: "business.address", label: "Your address (one line)" },
  { key: "business.tax_id", label: "Your tax ID" },
  { key: "contract.number", label: "Contract number (assigned when sent)" },
  { key: "contract.title", label: "Contract title" },
  { key: "contract.effective_date", label: "Start date" },
  { key: "contract.end_date", label: "End date" },
  { key: "quote.number", label: "Linked quote number" },
  { key: "quote.title", label: "Linked quote title" },
  { key: "quote.total", label: "Linked quote total" },
  { key: "project.name", label: "Linked project name" },
  { key: "today", label: "Date the contract is sent" },
] as const
export type MergeFieldKey = (typeof MERGE_FIELDS)[number]["key"]
export type MergeValues = Partial<Record<MergeFieldKey, string | null>>

const FIELD = /\{\{\s*([a-z_]+(?:\.[a-z_]+)?)\s*\}\}/g
const KNOWN = new Set<string>(MERGE_FIELDS.map((f) => f.key))

/** Fields used in `text` that are unknown or have no value. */
export function unresolvedFields(text: string, values: MergeValues): string[] {
  const missing = new Set<string>()
  for (const [, key] of text.matchAll(FIELD)) {
    if (!KNOWN.has(key!) || !values[key as MergeFieldKey]) missing.add(key!)
  }
  return [...missing]
}

/** Replace known fields that have values; leave the rest as `{{key}}`. */
export function renderMergeFields(text: string, values: MergeValues): string {
  return text.replace(FIELD, (match, key: string) => {
    const v = KNOWN.has(key) ? values[key as MergeFieldKey] : null
    return v ? v : `{{${key}}}`
  })
}

export type ContractBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }

const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^[-*]\s+(.*)$/
const NUMBERED = /^\d+[.)]\s+(.*)$/

/**
 * Parse the Markdown subset: `#`/`##`/`###` headings, `-` or `1.` lists,
 * blank-line separated paragraphs (single newlines are kept as line breaks).
 */
export function parseContractText(text: string): ContractBlock[] {
  const blocks: ContractBlock[] = []
  let para: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (para.length) blocks.push({ type: "paragraph", text: para.join("\n") })
    if (list) blocks.push({ type: "list", ...list })
    para = []
    list = null
  }
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    const h = HEADING.exec(line)
    if (h) {
      flush()
      blocks.push({
        type: "heading",
        level: h[1]!.length as 1 | 2 | 3,
        text: h[2]!.trim(),
      })
      continue
    }
    const b = BULLET.exec(line.trim())
    const n = b ? null : NUMBERED.exec(line.trim())
    if (b || n) {
      const ordered = Boolean(n)
      if (para.length || (list && list.ordered !== ordered)) flush()
      list ??= { ordered, items: [] }
      list.items.push((b ?? n)![1]!)
      continue
    }
    if (list) {
      // Continuation of the previous list item.
      if (/^\s+/.test(raw) && list.items.length) {
        list.items[list.items.length - 1] += `\n${line.trim()}`
        continue
      }
      flush()
    }
    para.push(line)
  }
  flush()
  return blocks
}

/** A neutral starting point users can adapt (not legal advice). */
export const SAMPLE_CONTRACT_TEMPLATE = {
  name: "Services agreement",
  body: `This agreement is made on {{today}} between **{{business.legal_name}}** ("Provider") and **{{client.legal_name}}** ("Client").

## 1. Services
The Provider will deliver the services described in quote {{quote.number}} (the "Services"). Changes to the scope must be agreed in writing by both parties.

## 2. Term
This agreement starts on {{contract.effective_date}} and continues until the Services are complete, unless ended earlier under section 6.

## 3. Fees and payment
- The fees for the Services are {{quote.total}}, plus any applicable taxes.
- Invoices are payable within the period stated on each invoice.
- Late payments may pause work until the account is settled.

## 4. Client responsibilities
The Client will provide timely feedback, content and access needed for the Provider to perform the Services.

## 5. Ownership
On full payment, the Client owns the final deliverables. The Provider keeps ownership of its pre-existing tools and materials and may show the work in its portfolio unless the Client objects in writing.

## 6. Ending the agreement
Either party may end this agreement with 14 days' written notice. The Client will pay for work completed up to the end date.

## 7. Confidentiality
Each party will keep the other's non-public information confidential and use it only for this agreement.

## 8. General
This agreement, together with the referenced quote, is the entire agreement between the parties. It may only be changed in writing.
`,
} as const

/** Split inline `**bold**` spans (unmatched markers stay literal). */
export function inlineRuns(text: string): { text: string; bold: boolean }[] {
  const runs: { text: string; bold: boolean }[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last)
      runs.push({ text: text.slice(last, m.index), bold: false })
    runs.push({ text: m[1]!, bold: true })
    last = m.index! + m[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false })
  return runs
}
