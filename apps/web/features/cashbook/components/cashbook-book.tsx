"use client"

import type { CashbookEntryType } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Kbd } from "@workspace/ui/components/kbd"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"

import { PageHeader } from "@/components/page-header"
import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"

import { useCashbook } from "../api/queries"
import { can, nowIn } from "../lib"
import { BookEntries } from "./book-entries"
import { BookReports } from "./book-reports"
import { BookSettings } from "./book-settings"
import { EntryDialog } from "./entry-dialog"

const TABS = ["entries", "reports", "settings"] as const

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    Boolean(target.closest("[role=dialog],[role=menu],[role=listbox]"))
  )
}

/** One book: entries, reports and settings, with Cash in / Cash out. */
export function CashbookBook({ bookId }: { bookId: string }) {
  const book = useCashbook(bookId)
  const tz = useWorkspaceProfile().data?.timezone
  const today = nowIn(tz).date
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS).withDefault("entries")
  )
  const [adding, setAdding] = React.useState<CashbookEntryType | null>(null)
  const b = book.data
  const canAdd = can.addEntries(b)

  // I / O add cash in / cash out, as long as you're not typing somewhere.
  React.useEffect(() => {
    if (!canAdd) return
    // Armed on key down, opened on key up: opening on key down focuses the
    // amount field in time for the "i" / "o" itself to be typed into it.
    let armed: CashbookEntryType | null = null
    const onDown = (e: KeyboardEvent) => {
      armed = null
      if (e.defaultPrevented || e.repeat) return
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      const k = e.key.toLowerCase()
      if (k !== "i" && k !== "o") return
      e.preventDefault()
      armed = k === "i" ? "in" : "out"
    }
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (!armed || k !== (armed === "in" ? "i" : "o")) return
      const type = armed
      armed = null
      setAdding(type)
    }
    window.addEventListener("keydown", onDown)
    window.addEventListener("keyup", onUp)
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
    }
  }, [canAdd])

  if (book.error)
    return (
      <p className="text-sm text-destructive">{errorMessage(book.error)}</p>
    )
  if (!b)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={b.name}
        breadcrumb={b.name}
        badge={
          b.archivedAt ? <Badge variant="secondary">Archived</Badge> : null
        }
        description={`${b.currency} · ${b.memberCount} ${b.memberCount === 1 ? "member" : "members"}${b.role !== "owner" ? ` · you're ${b.role === "admin" ? "an" : "a"} ${b.role}` : ""}`}
        actions={
          canAdd ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border-primary/40 text-primary hover:text-primary"
                onClick={() => setAdding("in")}
              >
                + Cash in <Kbd className="ml-1 hidden sm:inline-flex">I</Kbd>
              </Button>
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:text-destructive"
                onClick={() => setAdding("out")}
              >
                − Cash out <Kbd className="ml-1 hidden sm:inline-flex">O</Kbd>
              </Button>
            </div>
          ) : null
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) =>
          void setTab(v === "entries" ? null : (v as never))
        }
      >
        <TabsList>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "entries" ? (
        <BookEntries book={b} today={today} onAdd={setAdding} />
      ) : tab === "reports" ? (
        <BookReports book={b} today={today} />
      ) : (
        <BookSettings book={b} />
      )}

      <EntryDialog
        book={b}
        open={adding !== null}
        onOpenChange={(o) => !o && setAdding(null)}
        entry={null}
        type={adding ?? "in"}
      />
    </div>
  )
}
