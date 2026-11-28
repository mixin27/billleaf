import { addDays, formatDuration, type Permission } from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  Badge,
  BottomActionBar,
  Button,
  Card,
  ErrorState,
  KeyboardAvoid,
  ListGroup,
  ListItem,
  RefreshControl,
  SectionHeader,
  SkeletonRows,
  Text,
  TextField,
  toast,
} from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import {
  APPROVAL_STATUS_LABELS,
  STATUS_TONE,
  useMemberWeek,
  useReviewWeek,
  useTimesheetApproval,
} from "@/features/approvals"
import { useDashboard } from "@/features/dashboard"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { shortDate } from "@/lib/format"

/**
 * One submitted week: where the time went (by project, by day), and
 * approve it or send it back with what to change. An approved week can be
 * reopened (with a note) so the member can change it.
 */
export default function ApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
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
  const [touched, setTouched] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)

  const date = (iso: string) => shortDate(iso.slice(0, 10), locale, today)
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  })
  const noteOk = note.trim().length >= 3
  const canReview = can("time.approve") && a && a.status !== "rejected"

  const act = (action: "approve" | "reject") => {
    if (!a) return
    if (action === "reject" && !noteOk) {
      setTouched(true)
      return
    }
    review.mutate(
      { action, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(
            action === "approve"
              ? `${a.memberName}'s week approved`
              : a.status === "approved"
                ? "Week reopened"
                : `Sent back to ${a.memberName}`
          )
          router.back()
        },
        onError: (e) => toast.error(errorMessage(e)),
      }
    )
  }

  const rows = sheet.data?.rows ?? []
  const days = sheet.data?.days ?? []
  const dayTotals = days.map((_, i) =>
    rows.reduce((s, r) => s + (r.seconds[i] ?? 0), 0)
  )
  const maxDay = Math.max(1, ...dayTotals)

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <Stack.Screen options={{ title: a?.memberName ?? "Timesheet" }} />
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Space[8] + (canReview ? 0 : playerInset) },
          ]}
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
              error={approval.error}
              onRetry={() => void approval.refetch()}
            />
          ) : !a ? (
            <SkeletonRows rows={4} />
          ) : (
            <>
              <Card>
                <View style={styles.head}>
                  <Text variant="headline">
                    {`${date(a.weekStart)} – ${date(addDays(a.weekStart, 6))}`}
                  </Text>
                  <Badge
                    label={APPROVAL_STATUS_LABELS[a.status]}
                    tone={STATUS_TONE[a.status]}
                  />
                </View>
                <View style={styles.split}>
                  <View style={styles.flex}>
                    <Text variant="caption" tone="muted">
                      Total
                    </Text>
                    <Text variant="title" numeric>
                      {formatDuration(a.totalSeconds)}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text variant="caption" tone="muted">
                      Billable
                    </Text>
                    <Text variant="title" numeric>
                      {formatDuration(a.billableSeconds)}
                    </Text>
                  </View>
                </View>
                <Text variant="callout" tone="muted">
                  {a.status === "submitted"
                    ? `Submitted ${date(a.submittedAt)}. Approve it, or send it back with what to change.`
                    : a.status === "approved"
                      ? `Approved by ${a.reviewedByName ?? "an approver"}${a.reviewedAt ? ` on ${date(a.reviewedAt)}` : ""}.`
                      : `Sent back by ${a.reviewedByName ?? "an approver"}${a.reviewedAt ? ` on ${date(a.reviewedAt)}` : ""}.`}
                </Text>
                {a.note ? (
                  <View
                    style={[styles.note, { backgroundColor: t.surfaceMuted }]}
                  >
                    <Text variant="callout">{`“${a.note}”`}</Text>
                  </View>
                ) : null}
              </Card>

              <View>
                <SectionHeader title="By project" />
                {sheet.error && !sheet.data ? (
                  <ErrorState
                    compact
                    error={sheet.error}
                    onRetry={() => void sheet.refetch()}
                  />
                ) : !sheet.data ? (
                  <SkeletonRows rows={2} />
                ) : rows.length === 0 ? (
                  <Text variant="callout" tone="muted">
                    No time in this week.
                  </Text>
                ) : (
                  <ListGroup>
                    {rows.map((r) => (
                      <ListItem
                        key={`${r.projectId}|${r.taskId}`}
                        title={
                          r.projectName
                            ? [r.projectName, r.taskTitle]
                                .filter(Boolean)
                                .join(": ")
                            : "No project"
                        }
                        subtitle={r.clientName ?? undefined}
                        trailing={
                          <Text variant="bodyStrong" numeric>
                            {formatDuration(
                              r.seconds.reduce((x, y) => x + y, 0)
                            )}
                          </Text>
                        }
                      />
                    ))}
                  </ListGroup>
                )}
              </View>

              {days.length > 0 && rows.length > 0 ? (
                <View>
                  <SectionHeader title="By day" />
                  <ListGroup>
                    {days.map((d, i) => (
                      <View key={d} style={styles.dayRow}>
                        <Text variant="label" style={styles.dayLabel}>
                          {`${weekday.format(new Date(`${d}T00:00:00Z`))} ${Number(d.slice(8, 10))}`}
                        </Text>
                        <View
                          style={[
                            styles.track,
                            { backgroundColor: t.surfaceMuted },
                          ]}
                        >
                          <View
                            style={[
                              styles.fill,
                              {
                                backgroundColor: t.primary,
                                width: `${Math.round(((dayTotals[i] ?? 0) / maxDay) * 100)}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text
                          variant="label"
                          numeric
                          tone={dayTotals[i] ? "default" : "subtle"}
                          style={styles.dayValue}
                        >
                          {dayTotals[i] ? formatDuration(dayTotals[i]!) : "–"}
                        </Text>
                      </View>
                    ))}
                  </ListGroup>
                </View>
              ) : null}

              {canReview ? (
                <TextField
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
                  error={
                    touched && !noteOk
                      ? `Say what ${a.memberName} should change`
                      : undefined
                  }
                />
              ) : null}
            </>
          )}
        </ScrollView>
        {canReview && a ? (
          <BottomActionBar>
            {a.status === "submitted" ? (
              <>
                <Button
                  title="Send back"
                  variant="secondary"
                  loading={
                    review.isPending && review.variables?.action === "reject"
                  }
                  disabled={review.isPending}
                  onPress={() => act("reject")}
                />
                <Button
                  title="Approve"
                  icon="check"
                  loading={
                    review.isPending && review.variables?.action === "approve"
                  }
                  disabled={review.isPending}
                  onPress={() => act("approve")}
                />
              </>
            ) : (
              <Button
                title="Reopen week"
                variant="secondary"
                loading={review.isPending}
                onPress={() => act("reject")}
              />
            )}
          </BottomActionBar>
        ) : null}
      </KeyboardAvoid>
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
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space[2],
  },
  split: { flexDirection: "row", gap: Space[4] },
  note: { borderRadius: Radius.md, padding: Space[3] },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[3],
    paddingHorizontal: Space[4] - 2,
    paddingVertical: Space[3],
  },
  dayLabel: { width: 56 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%" },
  dayValue: { width: 52, textAlign: "right" },
})
