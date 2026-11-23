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
  | { type: "rule" }

const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^[-*]\s+(.*)$/
const NUMBERED = /^\d+[.)]\s+(.*)$/
/** A line of three or more dashes on its own: a horizontal rule. */
const RULE = /^-{3,}$/

/**
 * Parse the Markdown subset: `#`/`##`/`###` headings, `-` or `1.` lists,
 * `---` rules, blank-line separated paragraphs (single newlines are kept
 * as line breaks). Inline formatting is handled by `inlineRuns`.
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
    if (RULE.test(line.trim())) {
      flush()
      blocks.push({ type: "rule" })
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

export interface InlineRun {
  text: string
  bold: boolean
  /** Set only when true, so plain runs stay `{ text, bold }`. */
  italic?: true
  /** A link's address (http, https or mailto only). */
  href?: string
}

/**
 * Characters a backslash makes literal: formatting (`\*`, `\_`, `\[`,
 * `\]`, `\\`) and what would start a heading, list or rule (`\#`, `\-`,
 * `1\.`, `1\)`).
 */
const ESCAPABLE = new Set(["\\", "*", "_", "[", "]", "#", "-", ".", ")"])
const LINK = /^\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s()]+)\)/i
const WORD = /[\p{L}\p{N}]/u
const SPACE = /\s/

/**
 * Where an `_italic_` or `*italic*` span starting at `i` ends, or -1. The
 * marker must open before a non-space and close after one, and an
 * underscore only counts between non-letters, so `snake_case`, `2 * 3` and
 * `______` signature lines stay as they are.
 */
function italicEnd(s: string, i: number, marker: "_" | "*"): number {
  const next = s[i + 1]
  if (!next || SPACE.test(next) || next === marker) return -1
  if (marker === "_" && i > 0 && WORD.test(s[i - 1]!)) return -1
  for (let j = i + 2; j < s.length; j++) {
    if (s[j] === "\\") {
      j++
      continue
    }
    if (s[j] === "{" && s[j + 1] === "{") {
      // Skip merge fields: their keys have underscores.
      const close = s.indexOf("}}", j)
      if (close > 0) j = close + 1
      continue
    }
    if (s[j] !== marker) continue
    if (marker === "*" && (s[j + 1] === "*" || s[j - 1] === "*")) continue
    if (SPACE.test(s[j - 1]!)) continue
    if (marker === "_" && j + 1 < s.length && WORD.test(s[j + 1]!)) continue
    return j
  }
  return -1
}

/**
 * Split inline formatting into runs: `**bold**`, `_italic_` (or
 * `*italic*`), `[links](https://…)`, and backslash escapes. Unmatched
 * markers stay literal, so older plain-text contracts read as before.
 */
export function inlineRuns(text: string): InlineRun[] {
  const runs: InlineRun[] = []
  const push = (t: string, style: Omit<InlineRun, "text">) => {
    if (!t) return
    const last = runs[runs.length - 1]
    if (
      last &&
      last.bold === style.bold &&
      last.italic === style.italic &&
      last.href === style.href
    )
      last.text += t
    else runs.push({ text: t, ...style })
  }
  const walk = (s: string, style: Omit<InlineRun, "text">) => {
    let buf = ""
    const flush = () => {
      push(buf, style)
      buf = ""
    }
    for (let i = 0; i < s.length; i++) {
      const c = s[i]!
      if (c === "\\" && ESCAPABLE.has(s[i + 1] ?? "")) {
        buf += s[++i]
        continue
      }
      if (c === "*" && s[i + 1] === "*") {
        const close = s.indexOf("**", i + 2)
        if (close > i + 2) {
          flush()
          walk(s.slice(i + 2, close), { ...style, bold: true })
          i = close + 1
          continue
        }
        buf += "**"
        i++
        continue
      }
      if ((c === "_" || c === "*") && !style.italic) {
        const close = italicEnd(s, i, c)
        if (close > 0) {
          flush()
          walk(s.slice(i + 1, close), { ...style, italic: true })
          i = close
          continue
        }
      }
      if (c === "[" && !style.href) {
        const m = LINK.exec(s.slice(i))
        if (m) {
          flush()
          walk(m[1]!, { ...style, href: m[2]! })
          i += m[0].length - 1
          continue
        }
      }
      buf += c
    }
    flush()
  }
  walk(text, { bold: false })
  return runs
}
