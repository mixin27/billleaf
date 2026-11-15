"use client"

import type { Permission } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { parseAsString, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import { Can } from "@/components/permissions/can"

import { useCreateRole, useDeleteRole, useUpdateRole } from "../api/mutations"
import { usePermissionCatalog, useRoles } from "../api/queries"

/**
 * Role list + permission matrix. Selected role lives in the URL (?role=…) via
 * nuqs; the unsaved permission draft is local component state.
 */
export function RolesManager() {
  const roles = useRoles()
  const catalog = usePermissionCatalog()
  const [roleId, setRoleId] = useQueryState("role", parseAsString)
  const selected = roles.data?.find((r) => r.id === roleId) ?? roles.data?.[0]

  const [draft, setDraft] = React.useState<Set<Permission>>(new Set())
  React.useEffect(() => {
    setDraft(new Set((selected?.permissions ?? []) as Permission[]))
  }, [selected?.id, selected?.permissions])

  const update = useUpdateRole()
  const remove = useDeleteRole()

  const grouped = React.useMemo(() => {
    const map = new Map<
      string,
      { key: Permission; action: string; description: string }[]
    >()
    for (const p of catalog.data ?? []) {
      const list = map.get(p.resource) ?? []
      list.push({
        key: p.key as Permission,
        action: p.action,
        description: p.description,
      })
      map.set(p.resource, list)
    }
    return [...map.entries()]
  }, [catalog.data])

  if (roles.isPending || catalog.isPending) {
    return <Skeleton className="h-64 w-full" />
  }
  if (roles.error) {
    return <p className="text-sm text-destructive">{roles.error.message}</p>
  }

  const dirty =
    selected &&
    (draft.size !== selected.permissions.length ||
      selected.permissions.some((p) => !draft.has(p as Permission)))

  return (
    <div className="grid gap-6 md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-1">
        {roles.data?.map((r) => (
          <button
            key={r.id}
            onClick={() => void setRoleId(r.id)}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
              selected?.id === r.id && "bg-muted font-medium"
            )}
          >
            {r.name}
            {r.isLocked ? <Badge variant="secondary">locked</Badge> : null}
          </button>
        ))}
        <Can permission="role.create">
          <NewRoleForm onCreated={(id) => void setRoleId(id)} />
        </Can>
      </aside>

      {selected ? (
        <section className="flex flex-col gap-4">
          <header className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-medium">{selected.name}</h2>
              <p className="text-sm text-muted-foreground">
                {selected.description}
              </p>
            </div>
            <div className="flex gap-2">
              {!selected.isSystem ? (
                <Can permission="role.delete">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      remove.mutate(selected.id, {
                        onSuccess: () => void setRoleId(null),
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    Delete
                  </Button>
                </Can>
              ) : null}
              <Can permission="role.update">
                <Button
                  size="sm"
                  disabled={!dirty || selected.isLocked || update.isPending}
                  onClick={() =>
                    update.mutate(
                      { id: selected.id, permissions: [...draft] },
                      {
                        onSuccess: () => toast.success("Role saved"),
                        onError: (e) => toast.error(e.message),
                      }
                    )
                  }
                >
                  Save changes
                </Button>
              </Can>
            </div>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {grouped.map(([resource, perms]) => (
              <fieldset key={resource} className="rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium capitalize">
                  {resource}
                </legend>
                <div className="flex flex-col gap-2">
                  {perms.map((p) => (
                    <label
                      key={p.key}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Checkbox
                        checked={draft.has(p.key)}
                        disabled={selected.isLocked}
                        onCheckedChange={(checked) =>
                          setDraft((prev) => {
                            const next = new Set(prev)
                            if (checked) next.add(p.key)
                            else next.delete(p.key)
                            return next
                          })
                        }
                      />
                      <span>
                        <span className="font-mono text-xs">{p.action}</span>
                        <span className="block text-xs text-muted-foreground">
                          {p.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function NewRoleForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = React.useState("")
  const create = useCreateRole()
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate(
          { name, permissions: [] },
          {
            onSuccess: (role) => {
              setName("")
              onCreated(role.id)
            },
            onError: (err) => toast.error(err.message),
          }
        )
      }}
    >
      <Input
        placeholder="New role"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8"
      />
      <Button
        size="sm"
        type="submit"
        disabled={name.trim().length < 2 || create.isPending}
      >
        Add
      </Button>
    </form>
  )
}
