"use client"

import type {
  ClientContact,
  ClientDetail as ClientDetailData,
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
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { Can, usePermissions } from "@/components/permissions/can"
import { ClientInvoices } from "@/features/invoices"
import { ClientExpenses } from "@/features/expenses"
import { ClientProjects } from "@/features/projects"
import { ClientQuotes } from "@/features/quotes"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"

import {
  useArchiveClient,
  useDeleteClient,
  useDeleteContact,
} from "../api/mutations"
import { useClient } from "../api/queries"
import { ClientFormDialog } from "./client-form-dialog"
import { ContactFormDialog } from "./contact-form-dialog"
import { PageHeader } from "@/components/page-header"

export function ClientDetail({ clientId }: { clientId: string }) {
  const client = useClient(clientId)
  const slug = useWorkspaceStore((s) => s.workspace?.slug)

  if (client.isPending) return <Skeleton className="h-64 w-full" />
  if (client.error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-destructive">{client.error.message}</p>
        <Link href={`/${slug}/clients`} className="text-sm underline">
          Back to clients
        </Link>
      </div>
    )
  }
  return <ClientDetailView client={client.data} />
}

function ClientDetailView({ client }: { client: ClientDetailData }) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const profile = useWorkspaceProfile()
  const { can } = usePermissions()
  const archive = useArchiveClient(client.id)
  const remove = useDeleteClient(client.id)
  const [editing, setEditing] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const archived = client.status === "archived"

  const address = [
    client.addressLine1,
    client.addressLine2,
    [client.city, client.state, client.postalCode].filter(Boolean).join(" "),
    client.country,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={client.name}
        badge={archived ? <Badge variant="secondary">Archived</Badge> : null}
        meta={
          <>
            <p className="text-sm text-muted-foreground capitalize">
              {client.type}
            </p>
          </>
        }
        actions={
          <>
            {can("client.update") || can("client.delete") ? (
              <div className="flex gap-2">
                <Can permission="client.update">
                  {!archived ? (
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                  ) : null}
                </Can>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline">More</Button>}
                  />
                  <DropdownMenuContent align="end">
                    <Can permission="client.update">
                      <DropdownMenuItem
                        onClick={() =>
                          archive.mutate(!archived, {
                            onSuccess: () =>
                              toast.success(
                                archived ? "Client restored" : "Client archived"
                              ),
                            onError: (e) => toast.error(errorMessage(e)),
                          })
                        }
                      >
                        {archived ? "Restore" : "Archive"}
                      </DropdownMenuItem>
                    </Can>
                    <Can permission="client.delete">
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setConfirmDelete(true)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </Can>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Email" value={client.email} />
              <Detail label="Phone" value={client.phone} />
              <Detail label="Website" value={client.website} />
              <Detail label="Tax ID" value={client.taxId} />
              <Detail
                label="Address"
                value={address.length ? address.join("\n") : null}
              />
              <Detail
                label="Billing"
                value={`${client.currency ?? profile.data?.defaultCurrency ?? "Default currency"} · Net ${
                  client.paymentTermsDays ??
                  profile.data?.paymentTermsDays ??
                  "—"
                } days${client.currency == null || client.paymentTermsDays == null ? " (workspace defaults)" : ""}`}
              />
              {client.notes ? (
                <Detail label="Notes" value={client.notes} wide />
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <ContactsCard
          clientId={client.id}
          contacts={client.contacts}
          disabled={archived}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ClientInvoices clientId={client.id} canCreate={!archived} />
        <ClientQuotes clientId={client.id} canCreate={!archived} />
        <ClientProjects clientId={client.id} canCreate={!archived} />
        <ClientExpenses clientId={client.id} canCreate={!archived} />
      </div>

      <ClientFormDialog
        open={editing}
        onOpenChange={setEditing}
        client={client}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The client and their contacts will be removed from your workspace.
              Consider archiving instead if you may work with them again.
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
                    toast.success("Client deleted")
                    router.push(`/${slug}/clients`)
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Detail({
  label,
  value,
  wide,
}: {
  label: string
  value: string | null
  wide?: boolean
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line">{value || "—"}</dd>
    </div>
  )
}

function ContactsCard({
  clientId,
  contacts,
  disabled,
}: {
  clientId: string
  contacts: ClientContact[]
  disabled: boolean
}) {
  const [editing, setEditing] = React.useState<ClientContact | "new" | null>(
    null
  )
  const remove = useDeleteContact(clientId)
  const { can } = usePermissions()
  const editable = can("client.update") && !disabled

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Contacts</CardTitle>
        {editable ? (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            Add
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts yet.</p>
        ) : (
          contacts.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between gap-2 text-sm"
            >
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {c.name}
                  {c.isPrimary ? (
                    <Badge variant="secondary">Primary</Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[c.title, c.email, c.phone].filter(Boolean).join(" · ") ||
                    "—"}
                </p>
              </div>
              {editable ? (
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(c)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      remove.mutate(c.id, {
                        onSuccess: () => toast.success("Contact removed"),
                        onError: (e) => toast.error(errorMessage(e)),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
      <ContactFormDialog
        clientId={clientId}
        contact={editing && editing !== "new" ? editing : undefined}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </Card>
  )
}
