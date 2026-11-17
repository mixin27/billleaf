"use client"

import {
  type ClockifyImportResult,
  formatDuration,
  TIME_IMPORT_SOURCES,
  type TimeImportSource,
} from "@workspace/contracts"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  CheckmarkCircle02Icon,
  FileImportIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { errorMessage } from "@/lib/api"

import { useClockifyImport } from "../api/reports"

type DateFormat = "auto" | "MDY" | "DMY" | "YMD"
const DATE_FORMATS: Record<DateFormat, string> = {
  auto: "Detect automatically",
  MDY: "Month/Day/Year (11/03/2026)",
  DMY: "Day/Month/Year (03/11/2026)",
  YMD: "Year-Month-Day (2026-11-03)",
}
const MAX_BYTES = 10 * 1024 * 1024

const SOURCES: Record<
  TimeImportSource,
  { name: string; how: React.ReactNode }
> = {
  clockify: {
    name: "Clockify",
    how: (
      <>
        In Clockify, open <b>Reports → Detailed</b>, pick the date range, then{" "}
        <b>Export → Save as CSV</b>.
      </>
    ),
  },
  toggl: {
    name: "Toggl Track",
    how: (
      <>
        In Toggl Track, open <b>Reports → Detailed</b>, pick the date range,
        then <b>Export → Download CSV</b>.
      </>
    ),
  },
  harvest: {
    name: "Harvest",
    how: (
      <>
        In Harvest, open <b>Reports → Time</b>, pick the date range, choose{" "}
        <b>Detailed report</b>, then <b>Export → CSV</b>. Harvest has no clock
        times, so entries come in as hours per day (shown under &ldquo;No set
        time&rdquo; in the calendar). People are matched by name.
      </>
    ),
  },
}

/**
 * Three steps: choose a detailed CSV export (Clockify, Toggl Track or
 * Harvest) → preview what will be created and imported → import.
 * Importing the same file twice adds nothing (every row has a fingerprint).
 */
export function ClockifyImport() {
  const run = useClockifyImport()
  const [source, setSource] = React.useState<TimeImportSource>("clockify")
  const [file, setFile] = React.useState<File | null>(null)
  const [dateFormat, setDateFormat] = React.useState<DateFormat>("auto")
  const [preview, setPreview] = React.useState<ClockifyImportResult | null>(
    null
  )
  const [done, setDone] = React.useState<ClockifyImportResult | null>(null)
  const input = React.useRef<HTMLInputElement>(null)

  const reset = () => {
    setFile(null)
    setPreview(null)
    setDone(null)
    if (input.current) input.current.value = ""
  }
  const doPreview = (f: File, fmt: DateFormat) =>
    run.mutate(
      { file: f, dryRun: true, dateFormat: fmt, source },
      {
        onSuccess: setPreview,
        onError: (e) => {
          setPreview(null)
          toast.error(errorMessage(e))
        },
      }
    )

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              className="text-primary"
              strokeWidth={1.8}
            />
            Imported {done.imported} {done.imported === 1 ? "entry" : "entries"}{" "}
            ({formatDuration(done.totalSeconds)})
          </div>
          <p className="text-sm text-muted-foreground">
            {done.duplicates
              ? `${done.duplicates} already imported before were skipped. `
              : ""}
            {done.invalid.length
              ? `${done.invalid.length} ${done.invalid.length === 1 ? "row" : "rows"} couldn’t be read. `
              : ""}
            The entries are in the tracker and reports.
          </p>
          <Button variant="outline" onClick={reset}>
            Import another file
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Tabs
            value={source}
            onValueChange={(v) => {
              setSource(v as TimeImportSource)
              reset()
            }}
          >
            <TabsList>
              {TIME_IMPORT_SOURCES.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {SOURCES[s].name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div>
            <p className="text-base font-semibold">
              Import from {SOURCES[source].name}
            </p>
            <p className="text-sm text-muted-foreground">
              {SOURCES[source].how} Up to 50,000 entries (10 MB) per file.
              {source === "harvest"
                ? ""
                : " Times are read in your workspace’s time zone."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CSV file" htmlFor="clockify-file">
              <input
                id="clockify-file"
                ref={input}
                type="file"
                accept=".csv,text/csv"
                className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setPreview(null)
                  if (f && f.size > MAX_BYTES) {
                    toast.error("Files must be 10 MB or smaller")
                    e.target.value = ""
                    return
                  }
                  setFile(f)
                  if (f) doPreview(f, dateFormat)
                }}
              />
            </Field>
            <Field
              label="Date format"
              htmlFor="clockify-date-format"
              hint="Only matters for dates like 03/04/2026"
            >
              <Select
                items={DATE_FORMATS}
                value={dateFormat}
                onValueChange={(v) => {
                  setDateFormat(v as DateFormat)
                  if (file) doPreview(file, v as DateFormat)
                }}
              >
                <SelectTrigger id="clockify-date-format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DATE_FORMATS) as DateFormat[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {DATE_FORMATS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {run.isPending && !preview ? (
            <p className="text-sm text-muted-foreground">Reading the file…</p>
          ) : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base font-semibold">Preview</p>
              <p className="text-xs text-muted-foreground">
                Dates read as {DATE_FORMATS[preview.dateFormat]}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="To import" value={String(preview.imported)} />
              <Stat label="Time" value={formatDuration(preview.totalSeconds)} />
              <Stat
                label="Already imported"
                value={String(preview.duplicates)}
              />
              <Stat label="Unreadable" value={String(preview.invalid.length)} />
            </dl>

            {preview.newClients.length ||
            preview.newProjects.length ||
            preview.newTags.length ||
            preview.newTasks ? (
              <div className="flex flex-col gap-2 text-sm">
                <p className="font-medium">Will be created</p>
                <ul className="flex flex-col gap-1 text-muted-foreground">
                  {preview.newClients.length ? (
                    <li>Clients: {preview.newClients.join(", ")}</li>
                  ) : null}
                  {preview.newProjects.length ? (
                    <li>
                      Projects:{" "}
                      {preview.newProjects
                        .map((p) =>
                          p.clientName ? `${p.name} (${p.clientName})` : p.name
                        )
                        .join(", ")}
                    </li>
                  ) : null}
                  {preview.newTasks ? (
                    <li>
                      {preview.newTasks}{" "}
                      {preview.newTasks === 1 ? "task" : "tasks"} (marked done)
                    </li>
                  ) : null}
                  {preview.newTags.length ? (
                    <li>Tags: {preview.newTags.join(", ")}</li>
                  ) : null}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Existing ones are matched by name, ignoring case. New projects
                  are hourly with no rate yet.
                </p>
              </div>
            ) : null}

            {preview.members.length ? (
              <div className="flex flex-col gap-2 text-sm">
                <p className="font-medium">People</p>
                <ul className="flex flex-col gap-1">
                  {preview.members.map((m) => (
                    <li
                      key={m.email ?? m.name}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span>{m.name}</span>
                      {m.email ? (
                        <span className="text-muted-foreground">{m.email}</span>
                      ) : null}
                      {m.matched ? (
                        <Badge variant="secondary">Member</Badge>
                      ) : (
                        <Badge variant="outline">Assigned to you</Badge>
                      )}
                      <span className="ml-auto text-muted-foreground tabular-nums">
                        {m.entries}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.invalid.length ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  {preview.invalid.length}{" "}
                  {preview.invalid.length === 1 ? "row" : "rows"} can’t be
                  imported
                </summary>
                <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
                  {preview.invalid.map((r) => (
                    <li key={r.line}>
                      Line {r.line}: {r.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button
                disabled={!file || preview.imported === 0 || run.isPending}
                onClick={() =>
                  file &&
                  run.mutate(
                    { file, dryRun: false, dateFormat, source },
                    {
                      onSuccess: setDone,
                      onError: (e) => toast.error(errorMessage(e)),
                    }
                  )
                }
              >
                <HugeiconsIcon icon={FileImportIcon} strokeWidth={1.8} />
                {preview.imported === 0
                  ? "Nothing new to import"
                  : `Import ${preview.imported} ${preview.imported === 1 ? "entry" : "entries"}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
