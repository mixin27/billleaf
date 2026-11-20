import {
  formatDuration,
  formatMoney,
  type Permission,
  type Project,
  PROJECT_STATUS_LABELS,
  type ProjectTimeSummary,
  type Task,
} from "@workspace/contracts"
import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { ProjectTasks } from "@/components/project-tasks"
import { Body, Button, Screen, Section } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import { useMe } from "@/features/me"
import {
  useInvoiceUnbilledTime,
  useProject,
  useProjectTimeSummary,
} from "@/features/projects"
import { canTrackTime, useRunningTimer, useStartTimer } from "@/features/time"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { shortDate } from "@/lib/format"

/** "12.5 h", for budgets (the time rows use 12:30). */
const hours = (seconds: number) => `${Math.round((seconds / 3600) * 10) / 10} h`

/**
 * One project: start a timer on it or one of its tasks, tick tasks off,
 * how much time and money it has used against its estimate, and invoice
 * its unbilled time. Editing stays on the web.
 */
export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const me = useMe()
  const can = (p: Permission) => me.data?.permissions.includes(p) ?? false
  const project = useProject(id)
  const summary = useProjectTimeSummary(id)
  const tracks = canTrackTime(me.data)
  const running = useRunningTimer(tracks)
  const start = useStartTimer()
  const invoice = useInvoiceUnbilledTime()
  const profile = useWorkspaceProfile().data
  const today = useDashboard().data?.today
  const locale =
    profile?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const [refreshing, setRefreshing] = React.useState(false)
  const p = project.data
  const s = summary.data

  const money = (amount: number, currency = p?.currency ?? "USD") =>
    formatMoney({ amount, currency }, locale)
  const date = (iso: string) => shortDate(iso, locale, today)

  const onThis = running.data?.projectId === id && !running.data.taskId
  /** On the project, or one of its tasks. */
  const startTimer = (task?: Task) => {
    const go = () =>
      start.mutate(
        { projectId: id, taskId: task?.id ?? null },
        {
          onSuccess: () => router.navigate("/time"),
          onError: (e) =>
            Alert.alert("Couldn't start the timer", errorMessage(e)),
        }
      )
    const other = running.data
    if (!other) return go()
    const from = [other.projectName, other.taskTitle].filter(Boolean).join(": ")
    const to = task ? `${p?.name}: ${task.title}` : p?.name
    Alert.alert(
      "Switch the timer?",
      `This stops the timer${from ? ` on ${from}` : ""} and starts one on ${to}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Switch", onPress: go },
      ]
    )
  }

  const canInvoice =
    p?.billing === "hourly" &&
    Boolean(p.clientId) &&
    can("invoice.create") &&
    can("time.read")
  const invoiceTime = () => {
    if (!p || !s) return
    Alert.alert(
      "Invoice unbilled time?",
      `Creates a draft invoice to ${p.clientName} for ${formatDuration(s.unbilledSeconds)} of billable time${
        s.unbilledAmount ? ` (${money(s.unbilledAmount, s.currency)})` : ""
      }. Review and issue it on the web.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create draft",
          onPress: () =>
            invoice.mutate(id, {
              onSuccess: (inv) =>
                router.push({
                  pathname: "/invoice/[id]",
                  params: { id: inv.id },
                }),
              onError: (e) =>
                Alert.alert("Couldn't create the invoice", errorMessage(e)),
            }),
        },
      ]
    )
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await Promise.all([project.refetch(), summary.refetch()])
              setRefreshing(false)
            }}
          />
        }
      >
        {project.error ? (
          <Body>{errorMessage(project.error)}</Body>
        ) : !p ? (
          <Body muted>Loading…</Body>
        ) : (
          <>
            <Header
              project={p}
              canOpenClient={can("client.read")}
              date={date}
            />

            {tracks && p.status !== "archived" ? (
              onThis ? (
                <Button
                  title="Timer running on this project"
                  variant="secondary"
                  onPress={() => router.navigate("/time")}
                />
              ) : (
                <Button
                  title="Start timer"
                  loading={start.isPending}
                  onPress={() => startTimer()}
                />
              )
            ) : null}

            <ProjectTasks
              projectId={id}
              locale={locale}
              today={today}
              canEdit={can("project.update") && p.status !== "archived"}
              canTrack={tracks && p.status !== "archived"}
              runningTaskId={running.data?.taskId ?? null}
              onStart={startTimer}
            />

            {summary.error ? (
              <Body>{errorMessage(summary.error)}</Body>
            ) : s ? (
              <Section title="Time">
                <TimeRows summary={s} money={money} />
                {canInvoice && s.unbilledSeconds > 0 ? (
                  <View style={styles.action}>
                    <Button
                      title="Invoice unbilled time"
                      variant="secondary"
                      loading={invoice.isPending}
                      onPress={invoiceTime}
                    />
                  </View>
                ) : null}
              </Section>
            ) : null}

            {s &&
            (p.estimateMinutes ||
              (p.estimateAmount && s.billableAmount !== null)) ? (
              <Section title="Budget">
                {p.estimateMinutes ? (
                  <Meter
                    label="Time"
                    used={s.totalSeconds / 60}
                    of={p.estimateMinutes}
                    text={`${hours(s.totalSeconds)} of ${hours(p.estimateMinutes * 60)}`}
                  />
                ) : null}
                {p.estimateAmount && s.billableAmount !== null ? (
                  <Meter
                    label="Money"
                    used={s.billableAmount}
                    of={p.estimateAmount}
                    text={`${money(s.billableAmount, s.currency)} of ${money(p.estimateAmount, s.currency)}`}
                  />
                ) : null}
              </Section>
            ) : null}

            <Section title="Details">
              <Detail label="Billing" value={billingLabel(p, money)} first />
              {p.startDate || p.dueDate ? (
                <Detail
                  label="Dates"
                  value={[
                    p.startDate ? `Starts ${date(p.startDate)}` : null,
                    p.dueDate ? `Due ${date(p.dueDate)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ) : null}
              {p.quoteNumber ? (
                <Detail label="From quote" value={p.quoteNumber} />
              ) : null}
            </Section>

            {p.description ? (
              <Section title="Description">
                <Body style={styles.notes} selectable>
                  {p.description}
                </Body>
              </Section>
            ) : null}

            {s && s.unapprovedSeconds > 0 ? (
              <Body muted style={Type.small}>
                {`${hours(s.unapprovedSeconds)} of unbilled time is waiting for timesheet approval and can't be invoiced yet.`}
              </Body>
            ) : null}
            {s && s.unratedSeconds > 0 ? (
              <Body muted style={Type.small}>
                {`${hours(s.unratedSeconds)} of unbilled time has no hourly rate. Set one on the web.`}
              </Body>
            ) : null}
            {p.billing === "hourly" && !p.clientId ? (
              <Body muted style={Type.small}>
                Add a client to the project on the web to invoice its time.
              </Body>
            ) : null}
            <Body muted style={[Type.small, { color: t.textSecondary }]}>
              Edit the project and its tasks on the web.
            </Body>
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function billingLabel(p: Project, money: (n: number) => string) {
  if (p.billing === "fixed")
    return p.budgetAmount != null
      ? `Fixed price, ${money(p.budgetAmount)}`
      : "Fixed price (not set)"
  if (p.billing === "hourly")
    return p.hourlyRate != null
      ? `${money(p.hourlyRate)} an hour`
      : "Hourly (member or default rate)"
  return "Not billable"
}

function Header({
  project: p,
  canOpenClient,
  date,
}: {
  project: Project
  canOpenClient: boolean
  date: (iso: string) => string
}) {
  const t = useTheme()
  const status =
    p.status === "active"
      ? p.isOverdue && p.dueDate
        ? `Overdue, was due ${date(p.dueDate)}`
        : "Active"
      : PROJECT_STATUS_LABELS[p.status]
  return (
    <View style={styles.gap}>
      <Text style={[Type.title, { color: t.text }]}>{p.name}</Text>
      {p.clientName && p.clientId ? (
        canOpenClient ? (
          <Pressable
            accessibilityRole="link"
            accessibilityHint="Opens the client"
            onPress={() =>
              router.push({
                pathname: "/client/[id]",
                params: { id: p.clientId! },
              })
            }
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={[Type.body, { color: t.primary }]}>
              {p.clientName}
            </Text>
          </Pressable>
        ) : (
          <Text style={[Type.body, { color: t.textSecondary }]}>
            {p.clientName}
          </Text>
        )
      ) : null}
      <Text
        style={[
          Type.small,
          { color: p.isOverdue ? t.danger : t.textSecondary },
        ]}
      >
        {status}
      </Text>
    </View>
  )
}

function TimeRows({
  summary: s,
  money,
}: {
  summary: ProjectTimeSummary
  money: (n: number, currency?: string) => string
}) {
  const rows = [
    { label: "Tracked", value: formatDuration(s.totalSeconds) },
    { label: "Billable", value: formatDuration(s.billableSeconds) },
    {
      label: "Not invoiced yet",
      value: `${formatDuration(s.unbilledSeconds)}${
        s.unbilledAmount ? ` · ${money(s.unbilledAmount, s.currency)}` : ""
      }`,
    },
  ]
  return rows.map((r, i) => (
    <Detail key={r.label} label={r.label} value={r.value} first={i === 0} row />
  ))
}

function Detail({
  label,
  value,
  first,
  row,
}: {
  label: string
  value: string
  first?: boolean
  /** Label and value side by side (numbers). */
  row?: boolean
}) {
  const t = useTheme()
  return (
    <View
      accessible
      style={[
        row ? styles.pair : styles.item,
        !first && { borderTopWidth: 1, borderTopColor: t.border },
      ]}
    >
      <Text style={[row ? Type.body : Type.small, { color: t.textSecondary }]}>
        {label}
      </Text>
      <Text style={[Type.body, row && styles.num, { color: t.text }]}>
        {value}
      </Text>
    </View>
  )
}

/** Used against an estimate; over 100% turns red. */
function Meter({
  label,
  used,
  of,
  text,
}: {
  label: string
  used: number
  of: number
  text: string
}) {
  const t = useTheme()
  const pct = Math.round((used / of) * 100)
  const over = used > of
  return (
    <View
      style={styles.item}
      accessible
      accessibilityLabel={`${label}: ${text}, ${pct}%`}
    >
      <View style={styles.meterHead}>
        <Text style={[Type.body, { color: t.text }]}>{label}</Text>
        <Text
          style={[
            Type.small,
            styles.num,
            { color: over ? t.danger : t.textSecondary },
          ]}
        >
          {`${pct}%`}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: t.backgroundSelected }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.min(100, Math.max(0, pct))}%`,
              backgroundColor: over ? t.danger : t.primary,
            },
          ]}
        />
      </View>
      <Text style={[Type.small, styles.num, { color: t.textSecondary }]}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four },
  gap: { gap: Spacing.one },
  item: { paddingVertical: Spacing.two + 2, gap: Spacing.one },
  pair: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  num: { fontVariant: ["tabular-nums"] },
  notes: { paddingVertical: Spacing.two + 2 },
  action: { paddingBottom: Spacing.two },
  meterHead: { flexDirection: "row", justifyContent: "space-between" },
  track: { height: 8, borderRadius: Radius.full, overflow: "hidden" },
  fill: { height: 8, borderRadius: Radius.full },
})
