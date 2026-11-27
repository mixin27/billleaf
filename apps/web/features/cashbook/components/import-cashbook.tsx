"use client"

import {
  type Cashbook,
  CASHBOOK_IMPORT_MAX_BYTES,
  type CashbookImportResult,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import * as React from "react"
import { toast } from "sonner"

import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { useImportCashbookCsv } from "../api/mutations"
import { Signed } from "./signed"

/**
 * Bring a book's history over from the CashBook app: pick its CSV export,
 * check the preview (a dry run), then import. Importing the same file again
 * adds nothing, so a newer export can be imported on top.
 */
export function ImportCashbook({ book }: { book: Cashbook }) {
  const locale = useWorkspaceProfile().data?.locale
  const run = useImportCashbookCsv(book.id)
  const input = React.useRef<HTMLInputElement>(null)
  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<CashbookImportResult | null>(
    null
  )
  const m = (n: number) => money(n, book.currency, locale)

  const pick = (f: File | null) => {
    setPreview(null)
    setFile(f)
    if (!f) return
    if (f.size > CASHBOOK_IMPORT_MAX_BYTES) {
      toast.error("That file is larger than 5 MB")
      return
    }
    run.mutate(
      { file: f, dryRun: true },
      {
        onSuccess: setPreview,
        onError: (e) => {
          toast.error(errorMessage(e))
          setFile(null)
        },
      }
    )
  }

  const commit = () =>
    file &&
    run.mutate(
      { file, dryRun: false },
      {
        onSuccess: (r) => {
          toast.success(
            `${r.added} ${r.added === 1 ? "entry" : "entries"} imported into ${book.name}`
          )
          setPreview(null)
          setFile(null)
        },
        onError: (e) => toast.error(errorMessage(e)),
      }
    )

  const p = preview
  const matches =
    p?.fileClosingBalance !== null && p?.fileClosingBalance === p?.balanceAfter

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">Import from CashBook</h2>
        <p className="text-sm text-muted-foreground">
          In the CashBook app, download the book&apos;s entries as a <b>CSV</b>{" "}
          file, then pick it here. You&apos;ll see what it adds before anything
          changes. Rows imported before are skipped, so you can import a newer
          export later.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="CashBook CSV export"
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null)
            e.target.value = ""
          }}
        />
        <Button
          variant="outline"
          disabled={run.isPending}
          onClick={() => input.current?.click()}
        >
          {file ? "Choose another file" : "Choose CSV file"}
        </Button>
        {file ? (
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {file.name}
            {run.isPending && !p ? " · reading…" : null}
          </span>
        ) : null}
      </div>

      {p ? (
        <div className="flex flex-col gap-3 rounded-xl border p-4 text-sm">
          <p className="font-medium">
            {p.added
              ? `${p.added} new ${p.added === 1 ? "entry" : "entries"}${p.from ? `, ${formatDate(p.from, locale)} – ${formatDate(p.to, locale)}` : ""}`
              : "Nothing new in this file"}
            {p.duplicates ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {p.duplicates} already imported
              </span>
            ) : null}
          </p>
          {p.added ? (
            <dl className="grid gap-3 sm:grid-cols-4">
              <Fact label="Cash in">
                <Signed>{m(p.totalIn)}</Signed>
              </Fact>
              <Fact label="Cash out">
                <Signed out>{m(p.totalOut)}</Signed>
              </Fact>
              <Fact label="Balance now">{m(p.balanceBefore)}</Fact>
              <Fact label="Balance after">
                <Signed value={p.balanceAfter}>{m(p.balanceAfter)}</Signed>
              </Fact>
            </dl>
          ) : null}
          {p.fileClosingBalance !== null && p.added ? (
            <p className={matches ? "text-primary" : "text-muted-foreground"}>
              {matches
                ? `✓ Matches the CashBook balance of ${m(p.fileClosingBalance)}.`
                : `CashBook shows ${m(p.fileClosingBalance)} at the end of this file${
                    p.fileOpeningBalance
                      ? `; the file starts mid-book, after a balance of ${m(p.fileOpeningBalance)}, which isn't in it`
                      : p.balanceBefore
                        ? "; this book already had entries"
                        : ""
                  }.`}
            </p>
          ) : null}
          {p.newModes.length || p.newCategories.length ? (
            <p className="text-muted-foreground">
              Adds{" "}
              {[
                p.newModes.length
                  ? `payment ${p.newModes.length === 1 ? "mode" : "modes"} ${p.newModes.join(", ")}`
                  : null,
                p.newCategories.length
                  ? `${p.newCategories.length === 1 ? "category" : "categories"} ${p.newCategories.join(", ")}`
                  : null,
              ]
                .filter(Boolean)
                .join(" and ")}
              .
            </p>
          ) : null}
          {p.unmatchedPeople.length ? (
            <p className="text-muted-foreground">
              Entries by {p.unmatchedPeople.join(", ")} will show as added by
              you: no member of this book has that name.
            </p>
          ) : null}
          {p.invalid.length ? (
            <div className="text-destructive">
              <p>
                {p.invalid.length} {p.invalid.length === 1 ? "row" : "rows"}{" "}
                can&apos;t be read and will be skipped:
              </p>
              <ul className="list-inside list-disc text-xs">
                {p.invalid.slice(0, 5).map((x) => (
                  <li key={x.line}>
                    Line {x.line}: {x.message}
                  </li>
                ))}
                {p.invalid.length > 5 ? (
                  <li>and {p.invalid.length - 5} more</li>
                ) : null}
              </ul>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button disabled={!p.added || run.isPending} onClick={commit}>
              {run.isPending
                ? "Importing…"
                : `Import ${p.added} ${p.added === 1 ? "entry" : "entries"}`}
            </Button>
            <Button
              variant="outline"
              disabled={run.isPending}
              onClick={() => {
                setPreview(null)
                setFile(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Fact({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  )
}
