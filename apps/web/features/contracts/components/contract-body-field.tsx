"use client"

import { MERGE_FIELDS } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import * as React from "react"

import { ContractText } from "./contract-text"

/**
 * Contract text editor: Write/Preview tabs, an "Insert field" menu that
 * drops {{merge.fields}} at the cursor, and a short formatting hint.
 */
export function ContractBodyField({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const [tab, setTab] = React.useState<"write" | "preview">("write")

  const insert = (key: string) => {
    const token = `{{${key}}}`
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + token + value.slice(end))
    setTab("write")
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </Tabs>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="outline" size="sm">
                Insert field
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Filled in when you send</DropdownMenuLabel>
              {MERGE_FIELDS.map((f) => (
                <DropdownMenuItem key={f.key} onClick={() => insert(f.key)}>
                  <span className="flex flex-col">
                    <span>{f.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {`{{${f.key}}}`}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {tab === "write" ? (
        <Textarea
          id={id}
          ref={ref}
          rows={18}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm"
          aria-invalid={Boolean(error)}
        />
      ) : (
        <div className="min-h-64 rounded-md border p-4">
          <ContractText text={value} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Use <code># Heading</code>, <code>## Section</code>, <code>- item</code>
        , <code>1. item</code> and <code>**bold**</code>. Fields show
        highlighted until they are filled in.
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
