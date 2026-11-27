"use client"

import {
  type Cashbook,
  CASHBOOK_ATTACHMENT_MAX_BYTES,
  CASHBOOK_MAX_ATTACHMENTS,
  type CashbookEntry,
  type CashbookEntryType,
  fromMinorUnits,
  toMinorUnits,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import * as React from "react"
import { toast } from "sonner"

import { DateInput } from "@/components/form/date-input"
import { Field } from "@/components/form/field"
import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { useRemoveAttachment, useSaveEntry } from "../api/mutations"
import { useCashbookOptions, useEntryActivity } from "../api/queries"
import { nowIn } from "../lib"

const NONE = "__none__"
const FILE_TYPES = "image/png,image/jpeg,image/webp,application/pdf"

const FIELD_LABELS: Record<string, string> = {
  type: "Type",
  amount: "Amount",
  entryDate: "Date",
  entryTime: "Time",
  remark: "Remark",
  contactName: "Contact",
  categoryId: "Category",
  modeId: "Payment mode",
}

/**
 * Add an entry (`entry` null, `type` preset by the button or the I / O
 * keys), or open one. Entries you can't change open read-only. "Save and
 * add new" keeps the dialog open with the same category and mode, for
 * recording many entries in a row.
 */
export function EntryDialog({
  book,
  open,
  onOpenChange,
  entry,
  type: initialType,
}: {
  book: Cashbook
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: CashbookEntry | null
  type: CashbookEntryType
}) {
  const profile = useWorkspaceProfile()
  const locale = profile.data?.locale
  const tz = profile.data?.timezone
  const categories = useCashbookOptions(book.id, "categories")
  const modes = useCashbookOptions(book.id, "modes")
  const save = useSaveEntry(book.id)
  const removeFile = useRemoveAttachment(book.id, entry?.id ?? "")
  const activity = useEntryActivity(book.id, open ? entry?.id : undefined)
  const readOnly = Boolean(entry && !entry.editable)
  const amountRef = React.useRef<HTMLInputElement>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)

  const [type, setType] = React.useState<CashbookEntryType>(initialType)
  const [amount, setAmount] = React.useState("")
  const [date, setDate] = React.useState("")
  const [time, setTime] = React.useState("")
  const [remark, setRemark] = React.useState("")
  const [contact, setContact] = React.useState("")
  const [categoryId, setCategoryId] = React.useState(NONE)
  const [modeId, setModeId] = React.useState(NONE)
  const [files, setFiles] = React.useState<File[]>([])

  const reset = React.useCallback(
    (keepPicks: boolean) => {
      const now = nowIn(tz)
      setType(entry?.type ?? initialType)
      setAmount(entry ? fromMinorUnits(entry.amount, book.currency) : "")
      setDate(entry?.entryDate ?? now.date)
      setTime(entry?.entryTime ?? now.time)
      setRemark(entry?.remark ?? "")
      setContact(entry?.contactName ?? "")
      if (!keepPicks) {
        setCategoryId(entry?.categoryId ?? NONE)
        setModeId(entry?.modeId ?? NONE)
      }
      setFiles([])
    },
    [entry, initialType, book.currency, tz]
  )

  React.useEffect(() => {
    if (open) reset(false)
  }, [open, reset])

  const minor = amount ? toMinorUnits(amount, book.currency) : null
  const amountInvalid = minor === null || minor < 1
  const tooBig = files.some((f) => f.size > CASHBOOK_ATTACHMENT_MAX_BYTES)
  const tooMany =
    (entry?.attachments.length ?? 0) + files.length > CASHBOOK_MAX_ATTACHMENTS
  const blocked = amountInvalid || tooBig || tooMany || !date || !time

  const submit = (addAnother: boolean) => {
    if (blocked) return
    save.mutate(
      {
        id: entry?.id,
        body: {
          type,
          amount: minor!,
          entryDate: date,
          entryTime: time,
          remark: remark.trim() || null,
          ...(book.fields.contact
            ? { contactName: contact.trim() || null }
            : {}),
          ...(book.fields.category
            ? { categoryId: categoryId === NONE ? null : categoryId }
            : {}),
          ...(book.fields.mode
            ? { modeId: modeId === NONE ? null : modeId }
            : {}),
        },
        files,
      },
      {
        onSuccess: ({ attachmentError }) => {
          if (attachmentError)
            toast.error(
              `Saved, but a file didn't upload: ${errorMessage(attachmentError)}`
            )
          else
            toast.success(
              entry
                ? "Entry saved"
                : `${type === "in" ? "Cash in" : "Cash out"} of ${money(minor!, book.currency, locale)} added`
            )
          if (addAnother) {
            reset(true)
            amountRef.current?.focus()
          } else onOpenChange(false)
        },
        onError: (e) => toast.error(errorMessage(e)),
      }
    )
  }

  const optionSelect = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    items: { id: string; name: string; archived: boolean }[]
  ) => (
    <Field label={label} htmlFor={id}>
      <Select
        items={{
          [NONE]: "None",
          ...Object.fromEntries(items.map((o) => [o.id, o.name])),
        }}
        value={value}
        disabled={readOnly}
        onValueChange={(v) => onChange(String(v ?? NONE))}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {items
            .filter((o) => !o.archived || o.id === value)
            .map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </Field>
  )

  const title = entry
    ? readOnly
      ? type === "in"
        ? "Cash in"
        : "Cash out"
      : "Edit entry"
    : type === "in"
      ? "Add cash in entry"
      : "Add cash out entry"

  const change = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—"
    if (field === "amount") return money(Number(value), book.currency, locale)
    if (field === "type") return value === "in" ? "Cash in" : "Cash out"
    if (field === "entryDate") return formatDate(String(value), locale)
    if (field === "categoryId" || field === "modeId") return "changed"
    return String(value)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {entry?.createdBy
              ? `Added by ${entry.createdBy.you ? "you" : entry.createdBy.name}${entry.edited ? " · edited" : ""}${readOnly ? ". You can't change it." : "."}`
              : `In ${book.name}, ${book.currency}.`}
          </DialogDescription>
        </DialogHeader>
        <form
          id="cashbook-entry"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit(false)
          }}
        >
          <Tabs
            className="sm:col-span-2"
            value={type}
            onValueChange={(v) => !readOnly && setType(v as CashbookEntryType)}
          >
            <TabsList className="w-full">
              <TabsTrigger value="in" disabled={readOnly}>
                Cash in (+)
              </TabsTrigger>
              <TabsTrigger value="out" disabled={readOnly}>
                Cash out (−)
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Field
            label={`Amount (${book.currency})`}
            htmlFor="cb-amount"
            className="sm:col-span-2"
            error={
              amount && amountInvalid ? "Enter an amount above 0" : undefined
            }
          >
            <Input
              id="cb-amount"
              ref={amountRef}
              autoFocus
              inputMode="decimal"
              required
              disabled={readOnly}
              className="h-11 text-lg tabular-nums"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Date" htmlFor="cb-date">
            <DateInput
              id="cb-date"
              required
              disabled={readOnly}
              value={date}
              onChange={setDate}
            />
          </Field>
          <Field label="Time" htmlFor="cb-time">
            <Input
              id="cb-time"
              type="time"
              required
              disabled={readOnly}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </Field>
          <Field label="Remark" htmlFor="cb-remark" className="sm:col-span-2">
            <Textarea
              id="cb-remark"
              rows={2}
              maxLength={500}
              disabled={readOnly}
              placeholder="e.g. Sold 3 bags of rice"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </Field>
          {book.fields.contact ? (
            <Field
              label="Contact"
              htmlFor="cb-contact"
              className="sm:col-span-2"
              hint="Who paid you, or who you paid."
            >
              <Input
                id="cb-contact"
                maxLength={120}
                disabled={readOnly}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </Field>
          ) : null}
          {book.fields.category
            ? optionSelect(
                "cb-category",
                "Category",
                categoryId,
                setCategoryId,
                categories.data ?? []
              )
            : null}
          {book.fields.mode
            ? optionSelect(
                "cb-mode",
                "Payment mode",
                modeId,
                setModeId,
                modes.data ?? []
              )
            : null}
          <Field
            label="Attachments"
            htmlFor="cb-files"
            className="sm:col-span-2"
            hint={`Photos or PDFs, up to 5 MB each and ${CASHBOOK_MAX_ATTACHMENTS} per entry.`}
            error={
              tooBig
                ? "A file is larger than 5 MB"
                : tooMany
                  ? `Up to ${CASHBOOK_MAX_ATTACHMENTS} files per entry`
                  : undefined
            }
          >
            <div className="flex flex-col gap-2">
              {(entry?.attachments ?? []).map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <a
                    className="min-w-0 flex-1 truncate underline"
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {a.filename}
                  </a>
                  {!readOnly ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={removeFile.isPending}
                      onClick={() =>
                        removeFile.mutate(a.id, {
                          onSuccess: () => toast.success("Attachment removed"),
                          onError: (e) => toast.error(errorMessage(e)),
                        })
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {!readOnly ? (
                <div>
                  <input
                    ref={fileInput}
                    id="cb-files"
                    type="file"
                    multiple
                    accept={FILE_TYPES}
                    className="sr-only"
                    onChange={(e) => {
                      setFiles([...files, ...Array.from(e.target.files ?? [])])
                      e.target.value = ""
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileInput.current?.click()}
                  >
                    Attach file
                  </Button>
                </div>
              ) : !entry?.attachments.length ? (
                <span className="text-sm text-muted-foreground">None</span>
              ) : null}
            </div>
          </Field>
        </form>

        {entry && activity.data?.length ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-semibold">Activity</p>
            <ul className="flex flex-col gap-2 text-sm">
              {activity.data.map((a, i) => (
                <li key={`${a.at}-${i}`}>
                  <p>
                    {`${a.action[0]!.toUpperCase()}${a.action.slice(1)} by ${a.by ?? "someone"}`}
                    <span className="text-muted-foreground">
                      {" · "}
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: tz,
                      }).format(new Date(a.at))}
                    </span>
                  </p>
                  {Object.entries(a.changes).map(([field, [before, after]]) => (
                    <p key={field} className="text-xs text-muted-foreground">
                      {`${FIELD_LABELS[field] ?? field}: ${change(field, before)} → ${change(field, after)}`}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && !entry ? (
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending || blocked}
              onClick={() => submit(true)}
            >
              Save and add new
            </Button>
          ) : null}
          {!readOnly ? (
            <Button
              type="submit"
              form="cashbook-entry"
              disabled={save.isPending || blocked}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
