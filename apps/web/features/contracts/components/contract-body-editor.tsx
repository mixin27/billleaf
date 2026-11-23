"use client"

import type { IconSvgElement } from "@hugeicons/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  MinusSignIcon,
  ParagraphIcon,
  Redo02Icon,
  TextBoldIcon,
  TextItalicIcon,
  Undo02Icon,
} from "@hugeicons/core-free-icons"
import {
  type Editor,
  EditorContent,
  useEditor,
  useEditorState,
} from "@tiptap/react"
import { Placeholder } from "@tiptap/extensions"
import StarterKit from "@tiptap/starter-kit"
import { docToMarkdown, markdownToDoc } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"

import { MergeField } from "./merge-field-node"

const SAFE_LINK = /^(https?:\/\/|mailto:)/i

/**
 * The editor's look: the same scale as the preview and the PDF, so what
 * you write is what the client reads.
 */
const CONTENT = cn(
  "min-h-96 px-4 py-3 text-sm leading-relaxed outline-none",
  "[&_p]:my-2 [&_p:first-child]:mt-0",
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold",
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_hr]:my-4 [&_li_p]:my-0.5 [&_strong]:font-semibold",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
)

/**
 * A rich editor for contract text that reads and writes the same Markdown
 * subset the PDF and client portal use: headings, lists, bold, italic,
 * links, rules and merge fields. Nothing else gets in (pasted Word or
 * Google Docs formatting is reduced to these).
 */
export function ContractBodyEditor({
  id,
  value,
  onChange,
  invalid,
  editorRef,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  /** The editor, for the "Insert field" menu outside it. */
  editorRef?: React.RefObject<Editor | null>
}) {
  // What we last sent up, so our own changes don't reset the editor.
  const emitted = React.useRef(value)
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          isAllowedUri: (url) => SAFE_LINK.test(url),
        },
      }),
      Placeholder.configure({
        placeholder:
          "Write the agreement. Insert fields for details that change per client.",
      }),
      MergeField,
    ],
    content: markdownToDoc(value),
    editorProps: {
      attributes: {
        id,
        class: CONTENT,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Contract text",
        ...(invalid ? { "aria-invalid": "true" } : {}),
      },
    },
    onUpdate: ({ editor: e }) => {
      const text = docToMarkdown(e.getJSON() as never)
      emitted.current = text
      onChange(text)
    },
  })

  React.useEffect(() => {
    if (editorRef) editorRef.current = editor
  }, [editor, editorRef])

  // A template was picked, or the text changed in the Source tab.
  React.useEffect(() => {
    if (!editor || value === emitted.current) return
    emitted.current = value
    editor.commands.setContent(markdownToDoc(value) as never, {
      emitUpdate: false,
    })
  }, [editor, value])

  return (
    <div
      className={cn(
        "rounded-md border bg-background",
        invalid && "border-destructive"
      )}
    >
      {editor ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
      {editor ? <WordCount editor={editor} /> : null}
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      paragraph: e.isActive("paragraph") && !e.isActive("listItem"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  })
  const chain = () => editor.chain().focus()
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-md border-b bg-background/95 px-1.5 py-1 backdrop-blur"
    >
      <Tool
        label="Text"
        icon={ParagraphIcon}
        active={s.paragraph}
        onClick={() => chain().setParagraph().run()}
      />
      <Tool
        label="Title"
        icon={Heading01Icon}
        active={s.h1}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      />
      <Tool
        label="Section heading"
        icon={Heading02Icon}
        active={s.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <Tool
        label="Subheading"
        icon={Heading03Icon}
        active={s.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <Divider />
      <Tool
        label="Bold"
        keys="⌘B"
        icon={TextBoldIcon}
        active={s.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <Tool
        label="Italic"
        keys="⌘I"
        icon={TextItalicIcon}
        active={s.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <LinkTool editor={editor} active={s.link} />
      <Divider />
      <Tool
        label="Bulleted list"
        icon={LeftToRightListBulletIcon}
        active={s.bullet}
        onClick={() => chain().toggleBulletList().run()}
      />
      <Tool
        label="Numbered list"
        icon={LeftToRightListNumberIcon}
        active={s.ordered}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <Tool
        label="Divider line"
        icon={MinusSignIcon}
        onClick={() => chain().setHorizontalRule().run()}
      />
      <Divider />
      <Tool
        label="Undo"
        keys="⌘Z"
        icon={Undo02Icon}
        disabled={!s.undo}
        onClick={() => chain().undo().run()}
      />
      <Tool
        label="Redo"
        keys="⇧⌘Z"
        icon={Redo02Icon}
        disabled={!s.redo}
        onClick={() => chain().redo().run()}
      />
    </div>
  )
}

function Tool({
  label,
  keys,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string
  keys?: string
  icon: IconSvgElement
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={keys ? `${label} (${keys})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the selection in the editor while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(active && "bg-muted text-foreground")}
    >
      <HugeiconsIcon icon={icon} strokeWidth={1.8} />
    </Button>
  )
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-border" />
}

/** Add, change or remove a link on the selected text. */
function LinkTool({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [url, setUrl] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const apply = () => {
    const href = url.trim()
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      setOpen(false)
      return
    }
    const full = /^[a-z]+:/i.test(href)
      ? href
      : href.includes("@")
        ? `mailto:${href}`
        : `https://${href}`
    if (!SAFE_LINK.test(full)) {
      setError("Use a web address (https://…) or an email address.")
      return
    }
    const chain = editor.chain().focus().extendMarkRange("link")
    if (editor.state.selection.empty && !active)
      chain
        .insertContent({
          type: "text",
          text: href,
          marks: [{ type: "link", attrs: { href: full } }],
        })
        .run()
    else chain.setLink({ href: full }).run()
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setUrl(String(editor.getAttributes("link").href ?? ""))
          setError(null)
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Link"
            aria-label="Link"
            aria-pressed={active}
            onMouseDown={(e) => e.preventDefault()}
            className={cn(active && "bg-muted text-foreground")}
          >
            <HugeiconsIcon icon={Link01Icon} strokeWidth={1.8} />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72">
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                apply()
              }
            }}
            placeholder="https://example.com or name@example.com"
            aria-label="Link address"
            aria-invalid={Boolean(error)}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            {active ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange("link")
                    .unsetLink()
                    .run()
                  setOpen(false)
                }}
              >
                Remove link
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={apply}>
              {active ? "Update" : "Add link"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function WordCount({ editor }: { editor: Editor }) {
  const words = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e.state.doc
        .textBetween(0, e.state.doc.content.size, " ", " ")
        .split(/\s+/)
        .filter(Boolean).length,
  })
  return (
    <p className="border-t px-3 py-1.5 text-right text-xs text-muted-foreground tabular-nums">
      {`${words.toLocaleString()} word${words === 1 ? "" : "s"}`}
    </p>
  )
}
