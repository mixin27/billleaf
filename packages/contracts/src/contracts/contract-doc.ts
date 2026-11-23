/**
 * Contract text ⇄ editor document (ProseMirror / Tiptap JSON).
 *
 * The rich editor on the web edits a document tree; contracts are stored
 * as the Markdown subset in `contract-text.ts`, which the PDF, the portal
 * and the signature hash read. These two functions convert between them,
 * so the editor never changes the storage format.
 */
import { inlineRuns, parseContractText } from "./contract-text.js"

export interface DocMark {
  type: "bold" | "italic" | "link"
  attrs?: { href?: string }
}
export interface DocNode {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
  marks?: DocMark[]
}

const FIELD = /\{\{\s*([a-z_]+(?:\.[a-z_]+)?)\s*\}\}/g

/** Text with its merge fields and line breaks as separate nodes. */
function inlineNodes(text: string): DocNode[] {
  const out: DocNode[] = []
  for (const run of inlineRuns(text)) {
    const marks: DocMark[] = []
    if (run.bold) marks.push({ type: "bold" })
    if (run.italic) marks.push({ type: "italic" })
    if (run.href) marks.push({ type: "link", attrs: { href: run.href } })
    const withMarks = (n: DocNode): DocNode =>
      marks.length ? { ...n, marks } : n
    run.text.split("\n").forEach((line, i) => {
      if (i > 0) out.push({ type: "hardBreak" })
      let last = 0
      for (const m of line.matchAll(FIELD)) {
        if (m.index! > last)
          out.push(withMarks({ type: "text", text: line.slice(last, m.index) }))
        out.push(withMarks({ type: "mergeField", attrs: { key: m[1] } }))
        last = m.index! + m[0].length
      }
      if (last < line.length)
        out.push(withMarks({ type: "text", text: line.slice(last) }))
    })
  }
  return out
}

const block = (type: string, text: string, attrs?: DocNode["attrs"]) => {
  const content = inlineNodes(text)
  return {
    type,
    ...(attrs ? { attrs } : {}),
    ...(content.length ? { content } : {}),
  }
}

/** Contract text → an editor document. */
export function markdownToDoc(text: string): DocNode {
  const content: DocNode[] = parseContractText(text).map((b) => {
    if (b.type === "heading")
      return block("heading", b.text, { level: b.level })
    if (b.type === "rule") return { type: "horizontalRule" }
    if (b.type === "list")
      return {
        type: b.ordered ? "orderedList" : "bulletList",
        content: b.items.map((item) => ({
          type: "listItem",
          content: [block("paragraph", item)],
        })),
      }
    return block("paragraph", b.text)
  })
  return {
    type: "doc",
    content: content.length ? content : [{ type: "paragraph" }],
  }
}

/** Escape what would otherwise read as formatting. */
function escapeText(text: string): string {
  let out = ""
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    const prev = text[i - 1]
    const next = text[i + 1]
    const word = (ch: string | undefined) =>
      Boolean(ch && /[\p{L}\p{N}]/u.test(ch))
    if (c === "\\" || c === "*" || c === "[" || c === "]") out += `\\${c}`
    // An underscore only needs it where it could open or close italics.
    else if (c === "_" && !(word(prev) && word(next))) out += "\\_"
    else out += c
  }
  return out
}

const has = (n: DocNode, type: DocMark["type"]) =>
  n.marks?.some((m) => m.type === type) ?? false
const hrefOf = (n: DocNode) =>
  n.marks?.find((m) => m.type === "link")?.attrs?.href

/** Consecutive nodes that share a value, in order. */
function groupBy<K>(nodes: DocNode[], key: (n: DocNode) => K) {
  const groups: { key: K; nodes: DocNode[] }[] = []
  for (const n of nodes) {
    const k = key(n)
    const last = groups[groups.length - 1]
    if (last && last.key === k) last.nodes.push(n)
    else groups.push({ key: k, nodes: [n] })
  }
  return groups
}

/**
 * Inline content → text. Marks nest bold ⊃ italic ⊃ link, so the output
 * parses back the same way; `indent` continues a list item's lines.
 */
function inlineText(nodes: DocNode[] = [], indent = ""): string {
  const leaf = (n: DocNode) =>
    n.type === "hardBreak"
      ? `\n${indent}`
      : n.type === "mergeField"
        ? `{{${String(n.attrs?.key ?? "")}}}`
        : escapeText(n.text ?? "")
  // Spaces just inside a marker would stop it parsing, so they go outside.
  const wrap = (inner: string, open: string, close = open) => {
    const lead = /^\s*/.exec(inner)![0]
    const trail = /\s*$/.exec(inner)![0]
    const core = inner.slice(lead.length, inner.length - trail.length)
    return core ? `${lead}${open}${core}${close}${trail}` : inner
  }
  return groupBy(nodes, (n) => has(n, "bold") && n.type !== "hardBreak")
    .map((b) => {
      const inner = groupBy(
        b.nodes,
        (n) => has(n, "italic") && n.type !== "hardBreak"
      )
        .map((it) => {
          const text = groupBy(it.nodes, hrefOf)
            .map((l) => {
              const t = l.nodes.map(leaf).join("")
              return l.key ? wrap(t, "[", `](${l.key})`) : t
            })
            .join("")
          return it.key ? wrap(text, "_") : text
        })
        .join("")
      return b.key ? wrap(inner, "**") : inner
    })
    .join("")
}

/** Keep a line from reading as a heading, list item or rule. */
function escapeLineStarts(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const [, indent = "", rest = ""] = /^(\s*)(.*)$/s.exec(line)!
      if (/^#{1,3}\s/.test(rest) || /^-\s/.test(rest) || /^-{3,}$/.test(rest))
        return `${indent}\\${rest}`
      const n = /^(\d+)([.)]\s.*)$/s.exec(rest)
      return n ? `${indent}${n[1]}\\${n[2]}` : line
    })
    .join("\n")
}

/** Lines of a list, flattening any nested lists into the same list. */
function listItems(list: DocNode): string[] {
  const items: string[] = []
  for (const li of list.content ?? []) {
    const parts: string[] = []
    for (const child of li.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList") {
        if (parts.length) items.push(parts.splice(0).join("\n  "))
        items.push(...listItems(child))
      } else parts.push(escapeLineStarts(inlineText(child.content, "  ")))
    }
    if (parts.length) items.push(parts.join("\n  "))
  }
  return items
}

/** An editor document → contract text. */
export function docToMarkdown(doc: DocNode): string {
  const blocks: string[] = []
  for (const n of doc.content ?? []) {
    if (n.type === "heading") {
      const level = Math.min(3, Math.max(1, Number(n.attrs?.level ?? 2)))
      const text = inlineText(n.content).replace(/\n/g, " ").trim()
      if (text) blocks.push(`${"#".repeat(level)} ${text}`)
    } else if (n.type === "horizontalRule") {
      blocks.push("---")
    } else if (n.type === "bulletList" || n.type === "orderedList") {
      const ordered = n.type === "orderedList"
      const lines = listItems(n).map(
        (t, i) => `${ordered ? `${i + 1}.` : "-"} ${t}`
      )
      if (lines.length) blocks.push(lines.join("\n"))
    } else {
      // Paragraphs, and anything else, as text.
      const text = escapeLineStarts(inlineText(n.content))
      if (text.trim()) blocks.push(text)
    }
  }
  return blocks.join("\n\n")
}
