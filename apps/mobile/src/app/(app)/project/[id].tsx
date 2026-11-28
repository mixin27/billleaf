import {
  formatDuration,
  formatMoney,
  type Permission,
  type Project,
  PROJECT_STATUS_LABELS,
  type ProjectTimeSummary,
  type Task,
} from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"

import { useMiniPlayerInset } from "@/components/nav/mini-player"
import { ProjectTasks } from "@/components/project-tasks"
import {
  Badge,
  type BadgeTone,
  BottomActionBar,
  Button,
  Card,
  confirm,
  ErrorState,
  Icon,
  KeyValue,
  ListGroup,
  RefreshControl,
  SectionHeader,
  Skeleton,
  SkeletonRows,
  Text,
  toast,
} from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
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
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { shortDate } from "@/lib/format"

/** "12.5 h", for budgets (the time rows use 12:30). */
const hours = (seconds: number) => `${Math.round((seconds / 3600) * 10) / 10} h`

const STATUS_TONE: Record<Project["status"], BadgeTone> = {
  active: "primary",
  on_hold: "warning",
  completed: "in",
  archived: "neutral",
}

/**
 * One project: start a timer on it or one of its tasks, tick tasks off,
 * how much time and money it has used against its estimate, and invoice
 * its unbilled time. Editing stays on the web.
 */
export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
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
  const startTimer = async (task?: Task) => {
    const go = () =>
      start.mutate(
        { projectId: id, taskId: task?.id ?? null },
        {
          onSuccess: () => router.navigate("/time"),
          onError: (e) =>
            toast.error(`Couldn't start the timer. ${errorMessage(e)}`),
        }
      )
    const other = running.data
    if (!other) return go()
    const from = [other.projectName, other.taskTitle].filter(Boolean).join(": ")
    const to = task ? `${p?.name}: ${task.title}` : p?.name
    if (
      await confirm({
        title: "Switch the timer?",
        message: `This stops the timer${from ? ` on ${from}` : ""} and starts one on ${to}.`,
        confirmLabel: "Switch",
      })
    )
      go()
  }

  const canInvoice =
    p?.billing === "hourly" &&
    Boolean(p.clientId) &&
    can("invoice.create") &&
    can("time.read")
  const invoiceTime = async () => {
    if (!p || !s) return
    const ok = await confirm({
      title: "Invoice unbilled time?",
      message: `Creates a draft invoice to ${p.clientName} for ${formatDuration(s.unbilledSeconds)} of billable time${
        s.unbilledAmount ? ` (${money(s.unbilledAmount, s.currency)})` : ""
      }. Review and issue it on the web.`,
      confirmLabel: "Create draft",
    })
    if (!ok) return
    invoice.mutate(id, {
      onSuccess: (inv) =>
        router.push({
          pathname: "/invoice/[id]",
          params: { id: inv.id },
        }),
      onError: (e) =>
        toast.error(`Couldn't create the invoice. ${errorMessage(e)}`),
    })
  }

  const showBar = Boolean(p) && tracks && p?.status !== "archived"

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <Stack.Screen options={{ title: p?.name ?? "Project" }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[8] + (showBar ? 0 : playerInset) },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
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
        {project.error && !project.data ? (
          <ErrorState
            error={project.error}
            onRetry={() => void project.refetch()}
          />
        ) : !p ? (
          <>
            <Card>
              <Skeleton width="60%" height={22} />
              <Skeleton width="35%" height={12} />
              <Skeleton width="80%" height={28} />
            </Card>
            <SkeletonRows rows={3} />
          </>
        ) : (
          <>
            <Card>
              <Header
                project={p}
                canOpenClient={can("client.read")}
                date={date}
              />
              {summary.error && !summary.data ? null : s ? (
                <TimeStats summary={s} money={money} />
              ) : (
                <Skeleton width="80%" height={28} />
              )}
              {s && canInvoice && s.unbilledSeconds > 0 ? (
                <Button
                  title="Invoice unbilled time"
                  icon="invoice"
                  variant="secondary"
                  size="sm"
                  loading={invoice.isPending}
                  onPress={invoiceTime}
                />
              ) : null}
            </Card>

            {summary.error && !summary.data ? (
              <ErrorState
                compact
                error={summary.error}
                onRetry={() => void summary.refetch()}
              />
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

            {s &&
            (p.estimateMinutes ||
              (p.estimateAmount && s.billableAmount !== null)) ? (
              <View>
                <SectionHeader title="Budget" />
                <ListGroup>
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
                </ListGroup>
              </View>
            ) : null}

            <View>
              <SectionHeader title="Details" />
              <ListGroup>
                <KeyValue label="Billing" value={billingLabel(p, money)} />
                {p.startDate || p.dueDate ? (
                  <KeyValue
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
                  <KeyValue label="From quote" value={p.quoteNumber} />
                ) : null}
              </ListGroup>
            </View>

            {p.description ? (
              <View>
                <SectionHeader title="Description" />
                <ListGroup>
                  <View style={styles.notes}>
                    <Text selectable>{p.description}</Text>
                  </View>
                </ListGroup>
              </View>
            ) : null}

            <View style={styles.notesGap}>
              {s && s.unapprovedSeconds > 0 ? (
                <Text variant="caption" tone="muted">
                  {`${hours(s.unapprovedSeconds)} of unbilled time is waiting for timesheet approval and can't be invoiced yet.`}
                </Text>
              ) : null}
              {s && s.unratedSeconds > 0 ? (
                <Text variant="caption" tone="muted">
                  {`${hours(s.unratedSeconds)} of unbilled time has no hourly rate. Set one on the web.`}
                </Text>
              ) : null}
              {p.billing === "hourly" && !p.clientId ? (
                <Text variant="caption" tone="muted">
                  Add a client to the project on the web to invoice its time.
                </Text>
              ) : null}
              <Text variant="caption" tone="muted">
                Edit the project and its tasks on the web.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
      {showBar ? (
        <BottomActionBar>
          {onThis ? (
            <Button
              title="Timer running on this project"
              icon="timer"
              variant="secondary"
              onPress={() => router.navigate("/time")}
            />
          ) : (
            <Button
              title="Start timer"
              icon="play"
              loading={start.isPending}
              onPress={() => void startTimer()}
            />
          )}
        </BottomActionBar>
      ) : null}
    </View>
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
  const overdue = p.status === "active" && p.isOverdue && p.dueDate
  const status = overdue
    ? `Overdue, was due ${date(p.dueDate!)}`
    : PROJECT_STATUS_LABELS[p.status]
  return (
    <View style={styles.gap}>
      <View style={styles.head}>
        <Text variant="headline" accessibilityRole="header" style={styles.flex}>
          {p.name}
        </Text>
        <Badge label={status} tone={overdue ? "out" : STATUS_TONE[p.status]} />
      </View>
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
            hitSlop={6}
            style={({ pressed }) => [
              styles.client,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Icon name="user" size={16} tone="primary" />
            <Text variant="label" tone="primary">
              {p.clientName}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.client}>
            <Icon name="user" size={16} tone="muted" />
            <Text variant="label" tone="muted">
              {p.clientName}
            </Text>
          </View>
        )
      ) : null}
    </View>
  )
}

/** Tracked, billable and not invoiced yet, side by side. */
function TimeStats({
  summary: s,
  money,
}: {
  summary: ProjectTimeSummary
  money: (n: number, currency?: string) => string
}) {
  const stats = [
    { label: "Tracked", value: formatDuration(s.totalSeconds) },
    { label: "Billable", value: formatDuration(s.billableSeconds) },
    {
      label: "Not invoiced yet",
      value: formatDuration(s.unbilledSeconds),
      sub: s.unbilledAmount ? money(s.unbilledAmount, s.currency) : undefined,
    },
  ]
  return (
    <View style={styles.split}>
      {stats.map((x) => (
        <View
          key={x.label}
          style={styles.flex}
          accessible
          accessibilityLabel={`${x.label}: ${[x.value, x.sub].filter(Boolean).join(", ")}`}
        >
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {x.label}
          </Text>
          <Text variant="title" numeric adjustsFontSizeToFit numberOfLines={1}>
            {x.value}
          </Text>
          {x.sub ? (
            <Text variant="caption" tone="muted" numeric numberOfLines={1}>
              {x.sub}
            </Text>
          ) : null}
        </View>
      ))}
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
      style={styles.meter}
      accessible
      accessibilityLabel={`${label}: ${text}, ${pct}%`}
    >
      <View style={styles.meterHead}>
        <Text variant="label">{label}</Text>
        <Text variant="label" numeric tone={over ? "out" : "muted"}>
          {`${pct}%`}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: t.surfaceMuted }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.min(100, Math.max(0, pct))}%`,
              backgroundColor: over ? t.outFill : t.primary,
            },
          ]}
        />
      </View>
      <Text variant="caption" tone="muted" numeric>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Space[4],
    gap: Space[4],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  gap: { gap: Space[1] },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Space[2],
  },
  client: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[1],
    alignSelf: "flex-start",
  },
  split: { flexDirection: "row", gap: Space[3] },
  notes: { paddingHorizontal: Space[4] - 2, paddingVertical: Space[3] },
  notesGap: { gap: Space[2] },
  meter: {
    gap: Space[2],
    paddingHorizontal: Space[4] - 2,
    paddingVertical: Space[3],
  },
  meterHead: { flexDirection: "row", justifyContent: "space-between" },
  track: { height: 8, borderRadius: Radius.full, overflow: "hidden" },
  fill: { height: 8, borderRadius: Radius.full },
})
