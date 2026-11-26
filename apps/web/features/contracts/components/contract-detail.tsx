"use client"

import type { Contract } from "@workspace/contracts"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Textarea } from "@workspace/ui/components/textarea"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { DateInput } from "@/components/form/date-input"
import { SendDialog } from "@/components/documents/send-dialog"
import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import { useClient } from "@/features/clients"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { openPdf } from "@/lib/download"
import { formatDate } from "@/lib/format"

import {
  useContractAction,
  useDeleteContract,
  useEmailContract,
  useSignContract,
  useVoidContract,
} from "../api/mutations"
import { useContract } from "../api/queries"
import { ContractStatusBadge } from "./contract-status-badge"
import { ContractText } from "./contract-text"
import { PageHeader } from "@/components/page-header"

export function ContractDetail({ id }: { id: string }) {
  const contract = useContract(id)
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  if (contract.isPending) return <Skeleton className="h-96 w-full" />
  if (contract.error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-destructive">{contract.error.message}</p>
        <Link href={`/${slug}/contracts`} className="text-sm underline">
          Back to contracts
        </Link>
      </div>
    )
  }
  return <ContractDetailView contract={contract.data} />
}

const today = () => new Date().toISOString().slice(0, 10)

function ContractDetailView({ contract: c }: { contract: Contract }) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const client = useClient(c.clientId)
  const { can } = usePermissions()
  const action = useContractAction(c.id)
  const sign = useSignContract(c.id)
  const voidContract = useVoidContract(c.id)
  const email = useEmailContract(c.id)
  const remove = useDeleteContract(c.id)
  const [dialog, setDialog] = React.useState<
    "send" | "sign" | "void" | "delete" | "email" | null
  >(null)
  const [signer, setSigner] = React.useState({ name: "", date: today() })
  const [voidReason, setVoidReason] = React.useState("")
  const draft = c.status === "draft"
  const canSend = can("contract.send")
  const primaryEmail =
    client.data?.contacts.find((x) => x.isPrimary && x.email)?.email ??
    client.data?.email ??
    null

  const fail = (e: unknown) => toast.error(errorMessage(e))

  const facts: [string, React.ReactNode][] = [
    [
      "Client",
      <Link
        key="c"
        className="underline"
        href={`/${slug}/clients/${c.clientId}`}
      >
        {c.clientName}
      </Link>,
    ],
    ["Starts", formatDate(c.effectiveDate, locale)],
    ["Ends", formatDate(c.endDate, locale)],
    [
      "Quote",
      c.quoteId ? (
        <Link
          key="q"
          className="underline"
          href={`/${slug}/quotes/${c.quoteId}`}
        >
          {c.quoteNumber ?? "Draft quote"}
        </Link>
      ) : (
        "—"
      ),
    ],
    [
      "Project",
      c.projectId ? (
        <Link
          key="p"
          className="underline"
          href={`/${slug}/projects/${c.projectId}`}
        >
          {c.projectName}
        </Link>
      ) : (
        "—"
      ),
    ],
    ...(c.status === "signed"
      ? ([
          [
            "Signed",
            `${c.signedByName ?? ""} · ${formatDate(c.signedAt, locale)}${c.signedVia === "portal" ? " · e-signed in the client portal" : ""}`,
          ],
        ] as [string, React.ReactNode][])
      : []),
    ...(c.status === "declined" && c.declineReason
      ? ([["Reason declined", c.declineReason]] as [string, React.ReactNode][])
      : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={c.title}
        badge={<ContractStatusBadge status={c.status} />}
        meta={
          <>
            <p className="text-sm text-muted-foreground">
              {c.number ?? "Draft"}
              {c.sentAt
                ? ` · Sent ${formatDate(c.sentAt.slice(0, 10), locale)}`
                : ""}
            </p>
          </>
        }
        actions={
          <>
            <div className="flex flex-wrap gap-2">
              {draft && can("contract.update") ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/${slug}/contracts/${c.id}/edit`} />}
                >
                  Edit
                </Button>
              ) : null}
              {draft && canSend ? (
                <Button
                  onClick={() => setDialog("send")}
                  disabled={c.unresolvedFields.length > 0}
                >
                  Mark as sent
                </Button>
              ) : null}
              {c.status === "sent" && canSend ? (
                <Button onClick={() => setDialog("sign")}>
                  Record signature
                </Button>
              ) : null}
              {(c.status === "sent" || c.status === "signed") && canSend ? (
                <Button variant="outline" onClick={() => setDialog("email")}>
                  Email
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline">More</Button>}
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      openPdf(`/v1/contracts/${c.id}/pdf`).catch(fail)
                    }
                  >
                    Download PDF
                  </DropdownMenuItem>
                  {c.status === "sent" && canSend ? (
                    <DropdownMenuItem
                      onClick={() =>
                        action.mutate("decline", {
                          onSuccess: () => toast.success("Marked as declined"),
                          onError: fail,
                        })
                      }
                    >
                      Mark declined
                    </DropdownMenuItem>
                  ) : null}
                  {(c.status === "sent" || c.status === "signed") && canSend ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDialog("void")}
                    >
                      Void
                    </DropdownMenuItem>
                  ) : null}
                  {draft && can("contract.delete") ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDialog("delete")}
                    >
                      Delete draft
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        }
      />

      {draft && c.unresolvedFields.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Before sending, fill in or remove:{" "}
          {c.unresolvedFields.map((f, i) => (
            <React.Fragment key={f}>
              {i > 0 ? ", " : ""}
              <code>{`{{${f}}}`}</code>
            </React.Fragment>
          ))}
          . Link a quote or set dates, or edit the text.
        </div>
      ) : null}
      {c.status === "void" && c.voidReason ? (
        <p className="text-sm text-muted-foreground">Voided: {c.voidReason}</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3 lg:grid-cols-6">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <article className="rounded-lg border bg-card p-6 sm:p-10">
        <ContractText text={c.renderedBody} />
      </article>

      <AlertDialog
        open={dialog === "send"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this contract as sent?</AlertDialogTitle>
            <AlertDialogDescription>
              It gets its number, and the text and both parties&apos; details
              are frozen. You can email the PDF next.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={action.isPending}
              onClick={() =>
                action.mutate("send", {
                  onSuccess: (res) => {
                    toast.success(`Sent as ${res.number}`)
                    setDialog("email")
                  },
                  onError: (e) => {
                    setDialog(null)
                    fail(e)
                  },
                })
              }
            >
              Mark as sent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={dialog === "sign"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record signature</DialogTitle>
            <DialogDescription>
              Who signed for {c.clientName}, and when. The signed contract
              can&apos;t be edited.
            </DialogDescription>
          </DialogHeader>
          <form
            id="sign-form"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              sign.mutate(
                {
                  signedByName: signer.name,
                  signedAt: signer.date || undefined,
                },
                {
                  onSuccess: () => {
                    toast.success("Signature recorded")
                    setDialog(null)
                  },
                  onError: fail,
                }
              )
            }}
          >
            <Field label="Signed by" htmlFor="signedByName">
              <Input
                id="signedByName"
                required
                value={signer.name}
                onChange={(e) => setSigner({ ...signer, name: e.target.value })}
              />
            </Field>
            <Field label="Date signed" htmlFor="signedAt">
              <DateInput
                id="signedAt"
                max={today()}
                value={signer.date}
                onChange={(v) => setSigner({ ...signer, date: v })}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="submit" form="sign-form" disabled={sign.isPending}>
              {sign.isPending ? "Saving…" : "Record signature"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "void"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void {c.number}?</DialogTitle>
            <DialogDescription>
              The contract stays in your records, marked void. This can&apos;t
              be undone.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason" htmlFor="voidReason" hint="Optional">
            <Textarea
              id="voidReason"
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={voidContract.isPending}
              onClick={() =>
                voidContract.mutate(voidReason, {
                  onSuccess: () => {
                    toast.success("Contract voided")
                    setDialog(null)
                  },
                  onError: fail,
                })
              }
            >
              Void contract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the draft contract.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Draft deleted")
                    router.push(`/${slug}/contracts`)
                  },
                  onError: fail,
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SendDialog
        open={dialog === "email"}
        onOpenChange={(o) => setDialog(o ? "email" : null)}
        title={`Email ${c.number ?? "contract"}`}
        defaultTo={primaryEmail}
        pending={email.isPending}
        onSend={(input) =>
          email.mutate(input, {
            onSuccess: () => {
              toast.success("Contract emailed")
              setDialog(null)
            },
            onError: fail,
          })
        }
      />
    </div>
  )
}
