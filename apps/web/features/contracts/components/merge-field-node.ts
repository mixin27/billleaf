import { mergeAttributes, Node } from "@tiptap/core"
import type { Mark } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { MERGE_FIELDS } from "@workspace/contracts"

/** Short chip labels: the menu's labels without their "(…)" notes. */
const LABELS = new Map<string, string>(
  MERGE_FIELDS.map((f) => [f.key, f.label.replace(/\s*\(.*\)$/, "")])
)
const FIELD = /\{\{\s*([a-z_]+(?:\.[a-z_]+)?)\s*\}\}/g

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mergeField: {
      /** Insert a {{merge.field}} at the cursor. */
      insertMergeField: (key: string) => ReturnType
    }
  }
}

/**
 * A {{merge.field}} as one inline chip: known fields show their label,
 * unknown ones their raw key, highlighted. `{{client.name}}` written as
 * text (typed, pasted or autocompleted) turns into a chip; it's saved back
 * as the `{{key}}` text.
 */
export const MergeField = Node.create({
  name: "mergeField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      key: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-field") ?? "",
        renderHTML: (attrs) => ({ "data-field": attrs.key }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-field]" }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const key = String(node.attrs.key)
    const label = LABELS.get(key)
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        title: `{{${key}}}`,
        class: label
          ? "rounded bg-primary/10 px-1 py-px text-[0.85em] font-medium text-primary"
          : "rounded bg-amber-100 px-1 py-px font-mono text-[0.85em] text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
      }),
      label ?? `{{${key}}}`,
    ]
  },

  renderText({ node }) {
    return `{{${String(node.attrs.key)}}}`
  },

  addCommands() {
    return {
      insertMergeField:
        (key) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { key } }),
    }
  },

  addProseMirrorPlugins() {
    const type = this.type
    return [
      new Plugin({
        key: new PluginKey("mergeFieldText"),
        // After any edit, swap `{{key}}` text for chips, keeping its marks.
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((t) => t.docChanged)) return null
          const found: {
            from: number
            to: number
            key: string
            marks: readonly Mark[]
          }[] = []
          state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text?.includes("{{")) return
            for (const m of node.text.matchAll(FIELD))
              found.push({
                from: pos + m.index!,
                to: pos + m.index! + m[0].length,
                key: m[1]!,
                marks: node.marks,
              })
          })
          if (!found.length) return null
          const tr = state.tr
          for (const f of found.reverse())
            tr.replaceWith(
              f.from,
              f.to,
              type.create({ key: f.key }, null, f.marks)
            )
          return tr
        },
      }),
    ]
  },
})
