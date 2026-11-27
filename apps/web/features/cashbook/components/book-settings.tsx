"use client"

import {
  type Cashbook,
  type CashbookFields,
  type CashbookRole,
  CASHBOOK_ROLES,
} from "@workspace/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { CurrencySelect } from "@/components/form/currency-select"
import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import { useMembers } from "@/features/members"
import { useMe, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"

import {
  useBookMembers,
  useDeleteCashbook,
  useDeleteOption,
  useSaveOption,
  useUpdateCashbook,
} from "../api/mutations"
import { useCashbookMembers, useCashbookOptions } from "../api/queries"
import type { OptionKind } from "../api/keys"
import { can } from "../lib"
import { ImportCashbook } from "./import-cashbook"

const ROLES = Object.keys(CASHBOOK_ROLES) as CashbookRole[]
const ROLE_ITEMS = Object.fromEntries(
  ROLES.map((r) => [r, CASHBOOK_ROLES[r].label])
)
const onError = (e: unknown) => toast.error(errorMessage(e))

/** Name, currency, entry fields, members, categories, modes, archive. */
export function BookSettings({ book }: { book: Cashbook }) {
  const manage = can.manage(book)
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      {manage ? <General book={book} /> : null}
      <Members book={book} />
      {manage ? (
        <div className="grid gap-8 md:grid-cols-2">
          <Options book={book} kind="categories" />
          <Options book={book} kind="modes" />
        </div>
      ) : null}
      {manage && !book.archivedAt ? <ImportCashbook book={book} /> : null}
      {can.own(book) ? <Danger book={book} /> : null}
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

const FIELDS: { key: keyof CashbookFields; label: string; hint: string }[] = [
  { key: "contact", label: "Contact", hint: "Who paid you, or who you paid." },
  { key: "category", label: "Category", hint: "Group entries, e.g. Rent." },
  { key: "mode", label: "Payment mode", hint: "Cash, Online, a card…" },
]

function General({ book }: { book: Cashbook }) {
  const update = useUpdateCashbook(book.id)
  const [name, setName] = React.useState(book.name)
  React.useEffect(() => setName(book.name), [book.name])
  const owner = can.own(book)
  const currencyLocked = book.entryCount > 0 || !owner

  return (
    <Section title="Book">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || name.trim() === book.name) return
          update.mutate(
            { name: name.trim() },
            { onSuccess: () => toast.success("Book renamed"), onError }
          )
        }}
      >
        <Field label="Name" htmlFor="book-settings-name">
          <div className="flex gap-2">
            <Input
              id="book-settings-name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={
                update.isPending || !name.trim() || name.trim() === book.name
              }
            >
              Save
            </Button>
          </div>
        </Field>
        <Field
          label="Currency"
          htmlFor="book-settings-currency"
          hint={
            book.entryCount > 0
              ? "Fixed once the book has entries. Start a new book for another currency."
              : owner
                ? undefined
                : "Only the owner can change it."
          }
        >
          <CurrencySelect
            id="book-settings-currency"
            value={book.currency}
            disabled={currencyLocked}
            onChange={(v) =>
              v &&
              v !== book.currency &&
              update.mutate(
                { currency: v },
                { onSuccess: () => toast.success("Currency changed"), onError }
              )
            }
          />
        </Field>
      </form>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Entry fields</p>
        <p className="text-sm text-muted-foreground">
          Turn off what this book doesn&apos;t need, so adding an entry stays
          quick. Amount, date, time and remark are always there.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="flex items-start gap-2">
              <Checkbox
                id={`field-${f.key}`}
                checked={book.fields[f.key]}
                disabled={update.isPending}
                onCheckedChange={(c) =>
                  update.mutate(
                    { fields: { [f.key]: Boolean(c) } },
                    { onError }
                  )
                }
              />
              <Label
                htmlFor={`field-${f.key}`}
                className="flex flex-col items-start gap-0"
              >
                <span>{f.label}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {f.hint}
                </span>
              </Label>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

function Members({ book }: { book: Cashbook }) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const me = useMe()
  const { can: has } = usePermissions()
  const owner = can.own(book)
  const members = useCashbookMembers(book.id)
  const workspaceMembers = useMembers()
  const { add, setRole, remove } = useBookMembers(book.id)
  const [adding, setAdding] = React.useState<string | null>(null)
  const [role, setNewRole] = React.useState<CashbookRole>("operator")
  const [removing, setRemoving] = React.useState<{
    memberId: string
    name: string
    self: boolean
  } | null>(null)
  const myEmail = me.data?.user.email
  const inBook = new Set((members.data ?? []).map((m) => m.memberId))
  const candidates = (workspaceMembers.data ?? []).filter(
    (m) => !inBook.has(m.id)
  )

  return (
    <Section
      title="Members"
      description="Only members see this book. Workspace owners and admins can open every book."
    >
      <ul className="flex flex-col divide-y rounded-xl border text-sm">
        {(members.data ?? []).map((m) => {
          const self = m.email === myEmail
          return (
            <li
              key={m.memberId}
              className="flex flex-wrap items-center gap-3 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {m.name}
                  {self ? (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      (you)
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.email}
                </p>
              </div>
              {owner ? (
                <Select
                  items={ROLE_ITEMS}
                  value={m.role}
                  onValueChange={(v) =>
                    v &&
                    v !== m.role &&
                    setRole.mutate(
                      { memberId: m.memberId, role: v as CashbookRole },
                      {
                        onSuccess: () =>
                          toast.success(
                            `${m.name} is now ${CASHBOOK_ROLES[v as CashbookRole].label.toLowerCase()}`
                          ),
                        onError,
                      }
                    )
                  }
                >
                  <SelectTrigger
                    className="w-32"
                    aria-label={`${m.name}'s role`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {CASHBOOK_ROLES[r].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-muted-foreground">
                  {CASHBOOK_ROLES[m.role].label}
                </span>
              )}
              {owner || self ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setRemoving({ memberId: m.memberId, name: m.name, self })
                  }
                >
                  {self ? "Leave" : "Remove"}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>

      {owner ? (
        has("member.read") ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!adding) return
              add.mutate(
                { memberId: adding, role },
                {
                  onSuccess: () => {
                    toast.success("Member added")
                    setAdding(null)
                  },
                  onError,
                }
              )
            }}
          >
            <Field label="Add a workspace member" htmlFor="book-add-member">
              <Select
                items={Object.fromEntries(
                  candidates.map((m) => [m.id, m.name])
                )}
                value={adding}
                disabled={!candidates.length}
                onValueChange={(v) => setAdding(v ? String(v) : null)}
              >
                <SelectTrigger id="book-add-member" className="w-56">
                  <SelectValue
                    placeholder={
                      candidates.length
                        ? "Pick a member"
                        : "Everyone is already in"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Role" htmlFor="book-add-role">
              <Select
                items={ROLE_ITEMS}
                value={role}
                onValueChange={(v) => v && setNewRole(v as CashbookRole)}
              >
                <SelectTrigger id="book-add-role" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {CASHBOOK_ROLES[r].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button type="submit" disabled={!adding || add.isPending}>
              Add
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              {CASHBOOK_ROLES[role].description} To add someone new, invite them
              to the workspace first.
            </p>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            You need permission to see workspace members to add people here.
          </p>
        )
      ) : null}

      <AlertDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing?.self
                ? "Leave this book?"
                : `Remove ${removing?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.self
                ? "You won't see it any more unless someone adds you back. Your entries stay."
                : "They won't see this book any more. Their entries stay."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                removing &&
                remove.mutate(removing.memberId, {
                  onSuccess: () => {
                    if (removing.self) {
                      toast.success(`You left ${book.name}`)
                      router.push(`/${slug}/cashbook`)
                    } else toast.success(`${removing.name} removed`)
                  },
                  onError,
                })
              }
            >
              {removing?.self ? "Leave" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  )
}

function Options({ book, kind }: { book: Cashbook; kind: OptionKind }) {
  const options = useCashbookOptions(book.id, kind)
  const save = useSaveOption(book.id, kind)
  const remove = useDeleteOption(book.id, kind)
  const [name, setName] = React.useState("")
  const label = kind === "categories" ? "Categories" : "Payment modes"
  return (
    <Section
      title={label}
      description="Hidden ones stay on past entries but aren't offered for new ones."
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          save.mutate(
            { name: name.trim() },
            { onSuccess: () => setName(""), onError }
          )
        }}
      >
        <Input
          aria-label={
            kind === "categories" ? "New category" : "New payment mode"
          }
          placeholder={kind === "categories" ? "New category" : "New mode"}
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={save.isPending || !name.trim()}>
          Add
        </Button>
      </form>
      {options.data?.length ? (
        <ul className="flex flex-col divide-y rounded-xl border text-sm">
          {options.data.map((o) => (
            <li key={o.id} className="flex items-center gap-1 p-2 pl-3">
              <span
                className={
                  o.archived
                    ? "flex-1 text-muted-foreground line-through"
                    : "flex-1"
                }
              >
                {o.name}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({ id: o.id, archived: !o.archived }, { onError })
                }
              >
                {o.archived ? "Show" : "Hide"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(o.id, { onError })}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">None yet.</p>
      )}
    </Section>
  )
}

function Danger({ book }: { book: Cashbook }) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const update = useUpdateCashbook(book.id)
  const del = useDeleteCashbook(book.id)
  const [confirming, setConfirming] = React.useState(false)
  const [typed, setTyped] = React.useState("")
  const archived = Boolean(book.archivedAt)
  return (
    <Section title="Archive or delete">
      <div className="flex flex-col gap-3 rounded-xl border p-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-muted-foreground">
            {archived
              ? "Archived: read-only, and listed under Archived. Unarchive to add entries again."
              : "Archive a book you no longer use. It becomes read-only and moves to Archived."}
          </p>
          <Button
            variant="outline"
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { archived: !archived },
                {
                  onSuccess: () =>
                    toast.success(
                      archived ? "Book unarchived" : "Book archived"
                    ),
                  onError,
                }
              )
            }
          >
            {archived ? "Unarchive" : "Archive"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <p className="min-w-0 flex-1 text-muted-foreground">
            Delete the book with all its entries and attachments, for good.
          </p>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setTyped("")
              setConfirming(true)
            }}
          >
            Delete book
          </Button>
        </div>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {book.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {book.entryCount}{" "}
              {book.entryCount === 1 ? "entry" : "entries"} and their
              attachments go with it. This can&apos;t be undone; only the
              deletion itself is kept in the audit log. Type the book&apos;s
              name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            aria-label="Book name"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={typed.trim() !== book.name || del.isPending}
              onClick={() =>
                del.mutate(undefined, {
                  onSuccess: () => {
                    toast.success(`${book.name} deleted`)
                    router.push(`/${slug}/cashbook`)
                  },
                  onError,
                })
              }
            >
              Delete book
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  )
}
