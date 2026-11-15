import { inlineRuns, parseContractText } from "@workspace/contracts"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"

const FIELD = /(\{\{\s*[a-z_.]+\s*\}\})/g
const IS_FIELD = /^\{\{\s*[a-z_.]+\s*\}\}$/

/** Inline text: **bold** spans, and unresolved {{fields}} as highlighted chips. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineRuns(text).map((run, i) => {
        const parts = run.text.split(FIELD)
        const content = parts.map((part, j) =>
          IS_FIELD.test(part) ? (
            <mark
              key={j}
              className="rounded bg-amber-100 px-1 font-mono text-[0.85em] text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
            >
              {part}
            </mark>
          ) : (
            <React.Fragment key={j}>{part}</React.Fragment>
          )
        )
        return run.bold ? (
          <strong key={i} className="font-semibold">
            {content}
          </strong>
        ) : (
          <React.Fragment key={i}>{content}</React.Fragment>
        )
      })}
    </>
  )
}

/** Renders contract text exactly like the PDF: headings, lists, paragraphs. */
export function ContractText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const blocks = parseContractText(text)
  if (blocks.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing written yet.</p>
  return (
    <div
      className={cn("flex flex-col gap-3 text-sm leading-relaxed", className)}
    >
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const size =
            b.level === 1 ? "text-xl" : b.level === 2 ? "text-base" : "text-sm"
          return (
            <h3 key={i} className={cn("mt-2 font-semibold", size)}>
              <Inline text={b.text} />
            </h3>
          )
        }
        if (b.type === "list") {
          const List = b.ordered ? "ol" : "ul"
          return (
            <List
              key={i}
              className={cn(
                "flex flex-col gap-1 pl-6",
                b.ordered ? "list-decimal" : "list-disc"
              )}
            >
              {b.items.map((item, j) => (
                <li key={j} className="whitespace-pre-line">
                  <Inline text={item} />
                </li>
              ))}
            </List>
          )
        }
        return (
          <p key={i} className="whitespace-pre-line">
            <Inline text={b.text} />
          </p>
        )
      })}
    </div>
  )
}
