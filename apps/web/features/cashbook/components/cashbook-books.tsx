"use client"

import { type Cashbook, CASHBOOK_ROLES } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import Link from "next/link"
import { parseAsBoolean, parseAsStringLiteral, useQueryState } from "nuqs"

import { PageHeader } from "@/components/page-header"
import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { docsUrl } from "@/lib/docs"
import { money } from "@/lib/format"

import { useCashbooks } from "../api/queries"
import { updatedAgo } from "../lib"
import { NewBookDialog } from "./new-book-dialog"
import { Signed } from "./signed"

const VIEWS = ["active", "archived"] as const

/** Cashbook home: your books as cards, and the way to add one. */
export function CashbookBooks() {
  const { can } = usePermissions()
  const canCreate = can("cashbook.create") || can("cashbook.manage")
  const [view, setView] = useQueryState(
    "view",
    parseAsStringLiteral(VIEWS).withDefault("active")
  )
  // ?new=true opens the create dialog (used by the command menu).
  const [creating, setCreating] = useQueryState(
    "new",
    parseAsBoolean.withDefault(false)
  )
  const books = useCashbooks(view === "archived")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cashbook"
        description={
          <>
            A running balance of cash in and cash out, one book per thing you
            track, shared with the people who keep it.{" "}
            <a
              className="underline"
              href={docsUrl("/docs/books/cashbook")}
              target="_blank"
              rel="noreferrer"
            >
              Learn more
            </a>
          </>
        }
        actions={
          canCreate ? (
            <Button onClick={() => void setCreating(true)}>New book</Button>
          ) : null
        }
      />

      <Tabs
        value={view}
        onValueChange={(v) =>
          void setView(v === "archived" ? "archived" : null)
        }
      >
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      {books.error ? (
        <p className="text-sm text-destructive">{errorMessage(books.error)}</p>
      ) : !books.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : books.data.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
          <p className="font-medium">
            {view === "archived" ? "No archived books" : "No books yet"}
          </p>
          {view === "active" ? (
            <>
              <p className="max-w-sm text-sm text-muted-foreground">
                {canCreate
                  ? "Add a book for each thing you track, like your shop or home. Record cash in and cash out, and see the balance."
                  : "You haven't been added to a cashbook yet. Ask the book's owner to add you."}
              </p>
              {canCreate ? (
                <Button className="mt-2" onClick={() => void setCreating(true)}>
                  New book
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {books.data.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      )}

      <NewBookDialog
        open={creating}
        onOpenChange={(o) => void setCreating(o || null)}
      />
    </div>
  )
}

function BookCard({ book: b }: { book: Cashbook }) {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const m = (n: number) => money(n, b.currency, locale)
  return (
    <Link
      href={`/${slug}/cashbook/${b.id}`}
      className="group flex flex-col gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{b.name}</p>
          <p className="text-xs text-muted-foreground">
            {[
              updatedAgo(b.lastActivityAt),
              b.memberCount > 1 ? `${b.memberCount} members` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {b.role !== "owner" ? (
          <Badge variant="secondary">{CASHBOOK_ROLES[b.role].label}</Badge>
        ) : null}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Net balance</p>
        <Signed
          value={b.balance}
          className="text-xl font-semibold tracking-tight"
        >
          {m(b.balance)}
        </Signed>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground tabular-nums">
        <span>
          In <span className="text-foreground">{m(b.totalIn)}</span>
        </span>
        <span>
          Out <span className="text-foreground">{m(b.totalOut)}</span>
        </span>
        <span className="ml-auto">{b.currency}</span>
      </div>
    </Link>
  )
}
