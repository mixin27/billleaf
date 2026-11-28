import { addDays, formatDuration, type TimeEntry } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import { Pressable, StyleSheet, View } from "react-native"

import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  IconButton,
  ListItem,
  Text,
  toast,
} from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { useMyWeek, useWeekSubmission } from "@/features/approvals"
import { useContinueEntry } from "@/features/time"
import { timerError } from "@/features/timer-controls"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { shortDate } from "@/lib/format"
import { haptic } from "@/lib/haptics"

export function projectLabel(e: {
  projectName: string | null
  taskTitle: string | null
}) {
  if (!e.projectName) return null
  return [e.projectName, e.taskTitle].filter(Boolean).join(": ")
}

/**
 * One entry: what and which project, its duration, and ▶ to continue it as
 * a new timer. Tap to edit (the running one is changed from the timer).
 */
export function TimeEntryRow({ entry: e }: { entry: TimeEntry }) {
  const resume = useContinueEntry()
  const project = projectLabel(e)
  return (
    <ListItem
      title={e.description || "No description"}
      subtitle={project ?? e.clientName ?? undefined}
      accessibilityLabel={`${e.description || "No description"}${project ? `, ${project}` : ""}, ${e.isRunning ? "running" : formatDuration(e.durationSeconds ?? 0)}`}
      accessibilityHint={e.isRunning ? "Opens the timer" : "Edit or delete"}
      onPress={() =>
        e.isRunning
          ? router.push("/timer")
          : router.push({ pathname: "/entry-edit", params: { id: e.id } })
      }
      trailing={
        e.isRunning ? (
          <Badge label="Running" tone="primary" />
        ) : (
          <View style={styles.trail}>
            <Text variant="bodyStrong" numeric>
              {formatDuration(e.durationSeconds ?? 0)}
            </Text>
            <IconButton
              icon="play"
              label={`Continue ${e.description || "this entry"}`}
              tone="primary"
              disabled={resume.isPending}
              onPress={() => {
                haptic.press()
                resume.mutate(e.id, {
                  onSuccess: () => toast.success("Timer started"),
                  onError: timerError("Couldn't continue"),
                })
              }}
            />
          </View>
        )
      }
    />
  )
}

/**
 * Seven days with their totals; tap one to pick it, ‹ › for the week
 * before or after (not past this week).
 */
export function WeekStrip({
  weekStart,
  selected,
  today,
  totals,
  locale,
  onSelect,
}: {
  weekStart: string
  selected: string
  today: string
  totals: Map<string, number>
  locale: string
  onSelect: (day: string) => void
}) {
  const t = useTheme()
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "narrow",
    timeZone: "UTC",
  })
  const range = `${shortDate(weekStart, locale, today)} – ${shortDate(addDays(weekStart, 6), locale, today)}`
  const thisWeek = today >= weekStart && today <= addDays(weekStart, 6)
  return (
    <View style={styles.strip}>
      <View style={styles.stripHead}>
        <IconButton
          icon="back"
          label="Previous week"
          onPress={() => onSelect(addDays(weekStart, -7))}
        />
        <Text variant="label" style={styles.range}>
          {thisWeek ? `This week · ${range}` : range}
        </Text>
        <IconButton
          icon="chevronRight"
          label="Next week"
          disabled={thisWeek}
          onPress={() => onSelect(addDays(weekStart, 7))}
        />
      </View>
      <View style={styles.days}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(weekStart, i)
          const on = d === selected
          const future = d > today
          const secs = totals.get(d) ?? 0
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: future }}
              accessibilityLabel={`${new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))}, ${formatDuration(secs)}`}
              disabled={future}
              onPress={() => {
                haptic.selection()
                onSelect(d)
              }}
              style={[
                styles.day,
                {
                  backgroundColor: on ? t.primary : t.surface,
                  borderColor: on ? t.primary : t.border,
                  opacity: future ? 0.45 : 1,
                },
              ]}
            >
              <Text
                variant="caption"
                style={{ color: on ? t.onPrimary : t.textMuted }}
              >
                {weekday.format(new Date(`${d}T00:00:00Z`))}
              </Text>
              <Text
                variant="bodyStrong"
                style={{ color: on ? t.onPrimary : t.text }}
              >
                {Number(d.slice(8, 10))}
              </Text>
              <Text
                variant="caption"
                numeric
                style={{
                  color: on ? t.onPrimary : secs ? t.inText : t.textSubtle,
                  fontSize: 11,
                }}
              >
                {secs ? formatDuration(secs) : "–"}
              </Text>
              {d === today && !on ? (
                <View
                  style={[styles.todayDot, { backgroundColor: t.primary }]}
                />
              ) : null}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/**
 * With approvals on: where the week stands and the one thing to do next
 * (submit, withdraw, submit again). Null when approvals are off.
 */
export function WeekStatusCard({
  day,
  today,
  locale,
  total,
}: {
  day: string
  today: string
  locale: string
  total: number
}) {
  const t = useTheme()
  const week = useMyWeek(day)
  const { submit, withdraw } = useWeekSubmission()
  const sheet = week.data
  if (!sheet?.approvalsEnabled) return null

  const a = sheet.approval
  const date = (iso: string) => shortDate(iso.slice(0, 10), locale, today)
  const future = sheet.weekStart > today
  const reviewer = a?.reviewedAt
    ? `${a.reviewedByName ?? "an approver"} on ${date(a.reviewedAt)}`
    : "an approver"
  const [status, tone]: [string, BadgeTone] = !a
    ? ["Not submitted", "neutral"]
    : a.status === "submitted"
      ? ["Waiting for approval", "warning"]
      : a.status === "approved"
        ? ["Approved", "in"]
        : ["Sent back", "out"]
  const text = !a
    ? future
      ? "You can submit this week once it starts."
      : total === 0
        ? "No time in this week yet."
        : "Submit the week when it's complete. It can't change while it's waiting or approved, and only approved time is invoiced."
    : a.status === "submitted"
      ? `Submitted ${date(a.submittedAt)}. Withdraw it to make changes.`
      : a.status === "approved"
        ? `Approved by ${reviewer}. Ask an approver to reopen it if something needs to change.`
        : `Sent back by ${reviewer}. Make the changes, then submit it again.`

  return (
    <Card>
      <View style={styles.statusHead}>
        <Badge label={status} tone={tone} />
        <Text variant="bodyStrong" numeric>
          {formatDuration(total)}
        </Text>
      </View>
      <Text variant="callout" tone="muted">
        {text}
      </Text>
      {a?.note && a.status !== "submitted" ? (
        <View style={[styles.note, { backgroundColor: t.surfaceMuted }]}>
          <Text variant="callout">{`“${a.note}”`}</Text>
        </View>
      ) : null}
      {!a || a.status === "rejected" ? (
        <Button
          title={a ? "Submit again" : "Submit for approval"}
          icon="checkCircle"
          loading={submit.isPending}
          disabled={future || total === 0}
          onPress={() =>
            submit.mutate(sheet.weekStart, {
              onSuccess: () => toast.success("Week submitted"),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        />
      ) : a.status === "submitted" ? (
        <Button
          title="Withdraw"
          variant="secondary"
          loading={withdraw.isPending}
          onPress={() =>
            withdraw.mutate(sheet.weekStart, {
              onSuccess: () => toast.success("Week withdrawn"),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        />
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  trail: { flexDirection: "row", alignItems: "center", gap: Space[1] },
  strip: { gap: Space[2] },
  stripHead: { flexDirection: "row", alignItems: "center" },
  range: { flex: 1, textAlign: "center" },
  days: { flexDirection: "row", gap: Space[1] + 2 },
  day: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: Space[2],
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  todayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  statusHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  note: { borderRadius: Radius.md, padding: Space[3] },
})
