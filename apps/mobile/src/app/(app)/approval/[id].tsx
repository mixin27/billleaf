import {
  addDays,
  formatDuration,
  type Permission,
  type TimesheetApproval,
} from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native"

import {
  Body,
  Button,
  Field,
  Screen,
  Section,
  ErrorState,
  RefreshControl,
} from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import {
  APPROVAL_STATUS_LABELS,
  useMemberWeek,
  useReviewWeek,
  useTimesheetApproval,
} from "@/features/approvals"
import { useDashboard } from "@/features/dashboard"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { shortDate } from "@/lib/format"

/**
 * One submitted week: where the time went (by project, by day), and
 * approve it or send it back with what to change. An approved week can be
 * reopened (with a note) so the member can change it.
 */
export default function ApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const me = useMe()
  const can = (p: Permission) => me.data?.permissions.includes(p) ?? false
  const approval = useTimesheetApproval(id)
  const a = approval.data
  const sheet = useMemberWeek(a?.weekStart, a?.memberId)
  const review = useReviewWeek(id)
  const today = useDashboard().data?.today
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const [note, setNote] = React.useState("")
  const [refreshing, setRefreshing] = React.useState(false)

  const date = (iso: string) => shortDate(iso.slice(0, 10), locale, today)
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  })
  const noteOk = note.trim().length >= 3

  const act = (action: "approve" | "reject") => {
    if (!a) return
    review.mutate(
      { action, note: note.trim() || undefined },
      {
        onSuccess: () => {
          setNote("")
          router.back()
        },
        onError: (e) =>
          Alert.alert(
            action === "approve"
              ? "Couldn't approve it"
              : "Couldn't send it back",
            errorMessage(e)
          ),
      }
    )
  }

  const rows = sheet.data?.rows ?? []
  const days = sheet.data?.days ?? []
  const dayTotals = days.map((_, i) =>
    rows.reduce((s, r) => s + (r.seconds[i] ?? 0), 0)
  )
  const canReview = can("time.approve") && a && a.status !== "rejected"

  return (
    <Screen>
      <Stack.Screen options={{ title: a?.memberName ?? "Timesheet" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await Promise.all([approval.refetch(), sheet.refetch()])
              setRefreshing(false)
            }}
          />
        }
      >
        {approval.error && !approval.data ? (
          <ErrorState
            compact
            error={approval.error}
            onRetry={() => void approval.refetch()}
          />
        ) : !a ? (
          <Body muted>Loading…</Body>
        ) : (
          <>
            <Summary approval={a} date={date} />

            <Section title="By project">
              {sheet.error ? (
                <Body muted style={[Type.small, styles.pad]}>
                  {errorMessage(sheet.error)}
                </Body>
              ) : !sheet.data ? (
                <Body muted style={[Type.small, styles.pad]}>
                  Loading…
                </Body>
              ) : rows.length === 0 ? (
                <Body muted style={[Type.small, styles.pad]}>
                  No time in this week.
                </Body>
              ) : (
                rows.map((r, i) => (
                  <Line
                    key={`${r.projectId}|${r.taskId}`}
                    first={i === 0}
                    label={
                      r.projectName
                        ? [r.projectName, r.taskTitle]
                            .filter(Boolean)
                            .join(": ")
                        : "No project"
                    }
                    sub={r.clientName}
                    muted={!r.projectName}
                    value={formatDuration(r.seconds.reduce((x, y) => x + y, 0))}
                  />
                ))
              )}
            </Section>

            {days.length > 0 && rows.length > 0 ? (
              <Section title="By day">
                {days.map((d, i) => (
                  <Line
                    key={d}
                    first={i === 0}
                    label={`${weekday.format(new Date(`${d}T00:00:00Z`))} ${date(d)}`}
                    muted={!dayTotals[i]}
                    value={dayTotals[i] ? formatDuration(dayTotals[i]!) : "–"}
                  />
                ))}
              </Section>
            ) : null}

            {canReview ? (
              <View style={styles.actions}>
                <Field
                  label={
                    a.status === "submitted"
                      ? "Note (needed to send back)"
                      : "Note (needed to reopen)"
                  }
                  value={note}
                  onChangeText={setNote}
                  placeholder={
                    a.status === "submitted"
                      ? "Optional when approving"
                      : `What ${a.memberName} should change`
                  }
                  maxLength={1000}
                  multiline
                  textAlignVertical="top"
                  style={styles.note}
                />
                {a.status === "submitted" ? (
                  <>
                    <Button
                      title="Approve"
                      loading={
                        review.isPending &&
                        review.variables?.action === "approve"
                      }
                      disabled={review.isPending}
                      onPress={() => act("approve")}
                    />
                    <Button
                      title="Send back"
                      variant="secondary"
                      loading={
                        review.isPending &&
                        review.variables?.action === "reject"
                      }
                      disabled={!noteOk || review.isPending}
                      onPress={() => act("reject")}
                    />
                  </>
                ) : (
                  <Button
                    title="Reopen week"
                    variant="secondary"
                    loading={review.isPending}
                    disabled={!noteOk}
                    onPress={() => act("reject")}
                  />
                )}
                {!noteOk && note.trim() ? (
                  <Body style={[Type.small, { color: t.textSecondary }]}>
                    Say a little more about what to change.
                  </Body>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function Summary({
  approval: a,
  date,
}: {
  approval: TimesheetApproval
  date: (iso: string) => string
}) {
  const t = useTheme()
  const state =
    a.status === "submitted"
      ? `Submitted ${date(a.submittedAt)}. Approve it, or send it back with what to change.`
      : a.status === "approved"
        ? `Approved by ${a.reviewedByName ?? "an approver"}${a.reviewedAt ? ` on ${date(a.reviewedAt)}` : ""}.${a.note ? ` “${a.note}”` : ""}`
        : `Sent back by ${a.reviewedByName ?? "an approver"}${a.reviewedAt ? ` on ${date(a.reviewedAt)}` : ""}: “${a.note}”`
  return (
    <View style={styles.summary}>
      <Text style={[Type.heading, { color: t.text }]}>
        {`${date(a.weekStart)} – ${date(addDays(a.weekStart, 6))}`}
      </Text>
      <Text style={[Type.small, { color: t.textSecondary }]}>
        <Text
          style={{
            color:
              a.status === "approved"
                ? t.primary
                : a.status === "rejected"
                  ? t.danger
                  : t.text,
            fontWeight: "600",
          }}
        >
          {APPROVAL_STATUS_LABELS[a.status]}
        </Text>
        {` · ${formatDuration(a.totalSeconds)} total · ${formatDuration(a.billableSeconds)} billable`}
      </Text>
      <Body muted style={Type.small}>
        {state}
      </Body>
    </View>
  )
}

function Line({
  label,
  sub,
  value,
  first,
  muted,
}: {
  label: string
  sub?: string | null
  value: string
  first: boolean
  muted?: boolean
}) {
  const t = useTheme()
  return (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: t.border },
      ]}
    >
      <View style={styles.flex}>
        <Text
          style={[Type.body, { color: muted ? t.textSecondary : t.text }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sub ? (
          <Text
            style={[Type.small, { color: t.textSecondary }]}
            numberOfLines={1}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      <Text
        style={[
          Type.body,
          {
            color: muted ? t.textSecondary : t.text,
            fontVariant: ["tabular-nums"],
          },
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  summary: { gap: Spacing.one },
  actions: { gap: Spacing.two },
  pad: { paddingVertical: Spacing.three },
  note: { minHeight: 80, paddingTop: Spacing.three },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
})
