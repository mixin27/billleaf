"use client"

import { REMINDER_OFFSETS, reminderOffsetLabel } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { errorMessage } from "@/lib/api"

import { useUpdateWorkspaceProfile } from "../api/mutations"
import { useWorkspaceProfile } from "../api/queries"

/** Settings → General: when unpaid invoices get an automatic reminder. */
export function InvoiceReminderSettings() {
  const profile = useWorkspaceProfile()
  const save = useUpdateWorkspaceProfile()
  const { can } = usePermissions()
  const editable = can("workspace.update")
  const saved = profile.data?.invoiceReminderOffsets
  const [picked, setPicked] = React.useState<number[]>([])
  React.useEffect(() => {
    if (saved) setPicked(saved)
  }, [saved])
  if (!profile.data) return null
  const dirty = JSON.stringify(picked) !== JSON.stringify(saved)

  return (
    <Card id="reminders">
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-base font-semibold">Payment reminders</p>
          <p className="text-sm text-muted-foreground">
            Email clients about unpaid invoices, with a link to view and pay.
            Reminders go to whoever the invoice was last sent to, stop once
            it&apos;s paid or voided, and can be paused on any invoice. Choose
            none to turn them off.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {REMINDER_OFFSETS.map((o) => {
            const id = `reminder-${o}`
            return (
              <div key={o} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  disabled={!editable}
                  checked={picked.includes(o)}
                  onCheckedChange={(on) =>
                    setPicked((p) =>
                      (on ? [...p, o] : p.filter((x) => x !== o)).sort(
                        (a, b) => a - b
                      )
                    )
                  }
                />
                <Label htmlFor={id} className="font-normal">
                  {o === 0
                    ? reminderOffsetLabel(o)
                    : `${reminderOffsetLabel(o)} due`}
                </Label>
              </div>
            )
          })}
        </div>
        {editable ? (
          <Button
            className="self-start"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate(
                { invoiceReminderOffsets: picked },
                {
                  onSuccess: () =>
                    toast.success(
                      picked.length ? "Reminders saved" : "Reminders turned off"
                    ),
                  onError: (e) => toast.error(errorMessage(e)),
                }
              )
            }
          >
            Save reminders
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
