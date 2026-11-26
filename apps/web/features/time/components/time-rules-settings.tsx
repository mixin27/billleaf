"use client"

import {
  roundingLabel,
  TIME_ROUNDING_MODES,
  TIME_ROUNDING_STEPS,
  type TimeRoundingMode,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import * as React from "react"
import { toast } from "sonner"

import { DateInput } from "@/components/form/date-input"
import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import {
  useUpdateWorkspaceProfile,
  useWorkspaceProfile,
} from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { docsUrl } from "@/lib/docs"
import { formatDate } from "@/lib/format"

const MODE_LABELS: Record<TimeRoundingMode, string> = {
  off: "No rounding",
  up: "Round up",
  nearest: "Round to nearest",
  down: "Round down",
}

/** Settings → General: rounding for invoices/reports and the locked period. */
export function TimeRulesSettings() {
  const profile = useWorkspaceProfile()
  const save = useUpdateWorkspaceProfile()
  const { can } = usePermissions()
  const editable = can("workspace.update")
  const p = profile.data
  const [mode, setMode] = React.useState<TimeRoundingMode>("off")
  const [minutes, setMinutes] = React.useState(15)
  const [lock, setLock] = React.useState("")
  React.useEffect(() => {
    if (!p) return
    setMode(p.timeRoundingMode)
    setMinutes(p.timeRoundingMinutes)
    setLock(p.timeLockedBefore ?? "")
  }, [p])
  if (!p) return null
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: p.timezone,
  }).format(new Date())
  const dirty =
    mode !== p.timeRoundingMode ||
    minutes !== p.timeRoundingMinutes ||
    (lock || null) !== p.timeLockedBefore
  const lockError = lock && lock > today ? "Today at the latest" : undefined

  return (
    <Card id="time-rules">
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-base font-semibold">Time rules</p>
          <p className="text-sm text-muted-foreground">
            Round each entry on invoices, project amounts and reports (tracked
            time stays exact), and lock time you&apos;ve already closed off.{" "}
            <a
              className="underline"
              href={docsUrl("/docs/work/time-tracking#time-rules")}
              target="_blank"
              rel="noreferrer"
            >
              Learn more
            </a>
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Rounding" htmlFor="rounding-mode">
            <Select
              items={MODE_LABELS}
              value={mode}
              disabled={!editable}
              onValueChange={(v) => setMode(v as TimeRoundingMode)}
            >
              <SelectTrigger id="rounding-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_ROUNDING_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="To"
            htmlFor="rounding-minutes"
            hint={mode === "off" ? undefined : roundingLabel({ mode, minutes })}
          >
            <Select
              items={Object.fromEntries(
                TIME_ROUNDING_STEPS.map((m) => [String(m), `${m} minutes`])
              )}
              value={String(minutes)}
              disabled={!editable || mode === "off"}
              onValueChange={(v) => setMinutes(Number(v))}
            >
              <SelectTrigger id="rounding-minutes" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_ROUNDING_STEPS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Lock time before"
            htmlFor="time-lock"
            error={lockError}
            hint={
              lock && !lockError
                ? `Nobody can add, change or delete time before ${formatDate(lock, p.locale)}.`
                : "Empty = nothing locked."
            }
          >
            <div className="flex gap-1.5">
              <DateInput
                id="time-lock"
                max={today}
                value={lock}
                disabled={!editable}
                onChange={(v) => setLock(v)}
              />
              {lock && editable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => setLock("")}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </Field>
        </div>
        {editable ? (
          <Button
            className="self-start"
            disabled={!dirty || Boolean(lockError) || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  timeRoundingMode: mode,
                  timeRoundingMinutes: minutes,
                  timeLockedBefore: lock || null,
                },
                {
                  onSuccess: () => toast.success("Time rules saved"),
                  onError: (e) => toast.error(errorMessage(e)),
                }
              )
            }
          >
            Save time rules
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
