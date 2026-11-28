import { type Dashboard, formatDuration } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import { Pressable, StyleSheet, View } from "react-native"

import {
  Amount,
  Avatar,
  Badge,
  Card,
  Chip,
  ErrorState,
  Icon,
  IconTile,
  type IconName,
  initialsOf,
  ListGroup,
  ListItem,
  SectionHeader,
  showActions,
  Skeleton,
  Text,
} from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { useMyWeek, useTimesheetApprovals } from "@/features/approvals"
import { useCashbooks } from "@/features/cashbook"
import { useMyTimeSummary } from "@/features/dashboard"
import { useInvoiceFilter } from "@/features/invoices"
import { useTheme } from "@/hooks/use-theme"
import { ago } from "@/components/cashbook/books-list"
import {
  type TimePeriod,
  PERIOD_LABELS,
  periodBars,
  periodRange,
} from "@/lib/home"
import { signedAmount } from "@/lib/money-display"
import { useHomeStore } from "@/stores/home-store"
import { useSalesPane } from "@/stores/panes"

// ── Needs attention ───────────────────────────────────────────────────

type Item = {
  key: string
  icon: IconName
  tone: "out" | "neutral" | "primary"
  title: string
  sub?: string
  onPress: () => void
}

/**
 * What's waiting on you, most urgent first: overdue invoices, payment
 * proofs, timesheets to approve, quotes about to expire, your week sent
 * back. Hidden when there's nothing.
 */
export function AttentionCard({
  dashboard: d,
  locale,
  today,
  canApprove,
  canTrack,
}: {
  dashboard: Dashboard | undefined
  locale: string
  today: string | undefined
  canApprove: boolean
  canTrack: boolean
}) {
  const approvals = useTimesheetApprovals("submitted", canApprove)
  const week = useMyWeek(canTrack ? today : undefined)
  const items: Item[] = []
  const money = (n: number, c: string) =>
    `${c} ${signedAmount(n, c, locale).text}`

  const overdue = d?.receivables?.totals.filter((x) => x.overdueCount > 0) ?? []
  const overdueCount = overdue.reduce((n, x) => n + x.overdueCount, 0)
  if (overdueCount > 0) {
    const oldest = Math.max(
      0,
      ...(d?.receivables?.overdueInvoices.map((i) => i.daysOverdue) ?? [])
    )
    items.push({
      key: "overdue",
      icon: "invoice",
      tone: "out",
      title: `${overdueCount} ${overdueCount === 1 ? "invoice" : "invoices"} overdue`,
      sub: [
        overdue.map((x) => money(x.overdue, x.currency)).join(" · "),
        oldest ? `oldest ${oldest} days` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      onPress: () => {
        useSalesPane.getState().setPane("invoices")
        useInvoiceFilter.getState().setFilter("overdue")
        router.push("/sales")
      },
    })
  }
  const proofs = d?.pendingProofs
  if (proofs && proofs.count > 0) {
    const first = proofs.items[0]
    items.push({
      key: "proofs",
      icon: "payment",
      tone: "primary",
      title: `${proofs.count} payment ${proofs.count === 1 ? "proof" : "proofs"} to review`,
      sub: first
        ? `${first.clientName}${first.invoiceNumber ? ` · ${first.invoiceNumber}` : ""}`
        : undefined,
      onPress: () =>
        proofs.count === 1 && first
          ? router.push({
              pathname: "/invoice/[id]",
              params: { id: first.invoiceId },
            })
          : (useSalesPane.getState().setPane("invoices"),
            useInvoiceFilter.getState().setFilter("unpaid"),
            router.push("/sales")),
    })
  }
  const pending = approvals.data?.enabled ? approvals.data.pendingCount : 0
  if (canApprove && pending > 0)
    items.push({
      key: "approvals",
      icon: "checklist",
      tone: "neutral",
      title: `${pending} ${pending === 1 ? "timesheet" : "timesheets"} to approve`,
      onPress: () => router.push("/approvals"),
    })
  const expiring = d?.quotes?.expiringSoonCount ?? 0
  if (expiring > 0)
    items.push({
      key: "quotes",
      icon: "hourglass",
      tone: "neutral",
      title: `${expiring} ${expiring === 1 ? "quote expires" : "quotes expire"} soon`,
      onPress: () => {
        useSalesPane.getState().setPane("quotes")
        useSalesPane.getState().setQuoteFilter("sent")
        router.push("/sales")
      },
    })
  const sheet = week.data
  if (
    canTrack &&
    sheet?.approvalsEnabled &&
    sheet.approval?.status === "rejected"
  )
    items.push({
      key: "sentBack",
      icon: "alert",
      tone: "out",
      title: "Your week was sent back",
      sub: sheet.approval.note
        ? `“${sheet.approval.note}”`
        : "Fix it and submit again",
      onPress: () =>
        router.navigate({
          pathname: "/time",
          params: { week: sheet.weekStart },
        }),
    })

  if (items.length === 0) return null
  return (
    <View>
      <SectionHeader
        title="Needs attention"
        trailing={<Badge label={String(items.length)} tone="out" />}
      />
      <ListGroup>
        {items.map((i) => (
          <ListItem
            key={i.key}
            title={i.title}
            subtitle={i.sub}
            leading={<IconTile icon={i.icon} tone={i.tone} />}
            chevron
            onPress={i.onPress}
          />
        ))}
      </ListGroup>
    </View>
  )
}

// ── Your time ─────────────────────────────────────────────────────────

const CHART_H = 84

/**
 * Your tracked and billable time for this week, month or year (a sheet
 * picks), bars per day (per month for the year), and your top projects.
 */
export function TimeCard({
  today,
  locale,
}: {
  today: string | undefined
  locale: string
}) {
  const t = useTheme()
  const period = useHomeStore((s) => s.period)
  const setPeriod = useHomeStore((s) => s.setPeriod)
  const range = today ? periodRange(period, today) : undefined
  const summary = useMyTimeSummary(range)
  const s = summary.data
  const bars = s && today ? periodBars(period, today, s.byDay, locale) : []
  const max = Math.max(1, ...bars.map((b) => b.seconds))
  const top = (s?.groups ?? [])
    .filter((g) => g.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 3)
  const pct =
    s && s.totalSeconds > 0
      ? Math.round((s.billableSeconds / s.totalSeconds) * 100)
      : null

  const pick = () =>
    showActions(
      (Object.keys(PERIOD_LABELS) as TimePeriod[]).map((p) => ({
        label: `${PERIOD_LABELS[p]}${p === period ? "  ✓" : ""}`,
        icon: "calendar",
        onPress: () => setPeriod(p),
      })),
      "Show time for"
    )

  return (
    <Card>
      <View style={styles.head}>
        <Text variant="headline">Your time</Text>
        <Chip
          label={PERIOD_LABELS[period]}
          caret
          selected={false}
          onPress={pick}
        />
      </View>
      {summary.error && !s ? (
        <ErrorState
          compact
          error={summary.error}
          onRetry={() => void summary.refetch()}
        />
      ) : null}
      <View style={styles.split}>
        <View style={styles.flex}>
          <Text variant="caption" tone="muted">
            Tracked
          </Text>
          {s ? (
            <Text variant="title" numeric>
              {formatDuration(s.totalSeconds)}
            </Text>
          ) : (
            <Skeleton width={90} height={26} />
          )}
        </View>
        <View style={styles.flex}>
          <Text variant="caption" tone="muted">
            Billable
          </Text>
          {s ? (
            <Text variant="title" numeric>
              {formatDuration(s.billableSeconds)}
            </Text>
          ) : (
            <Skeleton width={90} height={26} />
          )}
          {pct !== null ? (
            <Text variant="caption" tone="muted">
              {`${pct}% of tracked`}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={styles.chart}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${PERIOD_LABELS[period]}: ${s ? formatDuration(s.totalSeconds) : "loading"} tracked, by ${period === "year" ? "month" : "day"}`}
      >
        {bars.map((b) => (
          <View key={b.key} style={styles.barCol}>
            <View
              style={[
                styles.bar,
                b.future
                  ? {
                      height: 14,
                      borderColor: t.borderStrong,
                      borderWidth: 1,
                      borderBottomWidth: 0,
                      borderStyle: "dashed",
                    }
                  : {
                      height: Math.max(2, (b.seconds / max) * CHART_H),
                      backgroundColor: b.current ? t.primary : t.primarySoft,
                    },
              ]}
            />
            <Text
              variant="caption"
              tone="subtle"
              style={styles.x}
              numberOfLines={1}
            >
              {b.label}
            </Text>
          </View>
        ))}
      </View>

      {top.length > 0 && s ? (
        <View style={styles.projects}>
          {top.map((g) => (
            <View key={g.key ?? "none"} style={styles.proj}>
              <View style={styles.projLine}>
                <Text variant="callout" numberOfLines={1} style={styles.flex}>
                  {g.detail ? `${g.label} · ${g.detail}` : g.label}
                </Text>
                <Text variant="callout" tone="muted" numeric>
                  {formatDuration(g.seconds)}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: t.surfaceMuted }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: t.primary,
                      width: `${Math.round((g.seconds / Math.max(1, s.totalSeconds)) * 100)}%`,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      ) : s ? (
        <Text variant="callout" tone="muted">
          Nothing tracked{" "}
          {period === "week"
            ? "this week"
            : period === "month"
              ? "this month"
              : "this year"}{" "}
          yet.
        </Text>
      ) : null}
    </Card>
  )
}

// ── Money owed and received ───────────────────────────────────────────

const AGING: {
  key: string
  label: string
  tone: "primary" | "warning" | "out"
}[] = [
  { key: "current", label: "Not yet due", tone: "primary" },
  { key: "late", label: "1–90 days", tone: "warning" },
  { key: "90_plus", label: "90+ days", tone: "out" },
]

/** What clients owe, per currency, with how late it is. */
export function OwedCard({
  dashboard: d,
  locale,
}: {
  dashboard: Dashboard
  locale: string
}) {
  const t = useTheme()
  const r = d.receivables
  if (!r) return null
  const color = { primary: t.primary, warning: t.warning, out: t.outFill }
  const totals = [...r.totals].sort((a, b) =>
    a.currency === d.primaryCurrency
      ? -1
      : b.currency === d.primaryCurrency
        ? 1
        : 0
  )
  const open = () => {
    useSalesPane.getState().setPane("invoices")
    useInvoiceFilter.getState().setFilter("unpaid")
    router.push("/sales")
  }
  return (
    <Card
      onPress={open}
      accessibilityLabel="Owed to you. Opens unpaid invoices"
    >
      <View style={styles.head}>
        <Text variant="headline">Owed to you</Text>
        <View style={styles.more}>
          <Text variant="label" tone="primary" style={{ fontWeight: "600" }}>
            Invoices
          </Text>
          <Icon name="chevronRight" size={16} tone="primary" />
        </View>
      </View>
      {totals.length === 0 ? (
        <Text variant="callout" tone="muted">
          Nothing owed right now.
        </Text>
      ) : (
        totals.map((x, i) => {
          const buckets =
            r.aging.find((a) => a.currency === x.currency)?.buckets ?? []
          const sum = (keys: string[]) =>
            buckets
              .filter((b) => keys.includes(b.bucket))
              .reduce((n, b) => n + b.amount, 0)
          const parts = [
            sum(["current"]),
            sum(["1_30", "31_60", "61_90"]),
            sum(["90_plus"]),
          ]
          const total = parts.reduce((a, b) => a + b, 0)
          return (
            <View
              key={x.currency}
              style={[
                styles.owed,
                i > 0 && {
                  borderTopColor: t.border,
                  borderTopWidth: StyleSheet.hairlineWidth,
                  paddingTop: Space[3],
                },
              ]}
            >
              <View style={styles.projLine}>
                <Text variant="label" tone="muted">
                  {x.currency}
                </Text>
                {x.overdue > 0 ? (
                  <Text variant="label" tone="out" numeric>
                    {`${signedAmount(x.overdue, x.currency, locale).text} overdue`}
                  </Text>
                ) : (
                  <Text variant="label" tone="muted">
                    {`${x.openCount} open`}
                  </Text>
                )}
              </View>
              <Amount
                value={x.outstanding}
                currency={x.currency}
                locale={locale}
                size="l"
              />
              {total > 0 ? (
                <View style={styles.aging}>
                  {parts.map((p, j) =>
                    p > 0 ? (
                      <View
                        key={AGING[j]!.key}
                        style={{
                          flex: p,
                          backgroundColor: color[AGING[j]!.tone],
                        }}
                      />
                    ) : null
                  )}
                </View>
              ) : null}
            </View>
          )
        })
      )}
      {totals.length > 0 ? (
        <View style={styles.legend}>
          {AGING.map((a) => (
            <View key={a.key} style={styles.legendItem}>
              <View
                style={[styles.swatch, { backgroundColor: color[a.tone] }]}
              />
              <Text variant="caption" tone="muted">
                {a.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  )
}

/** Payments received this month against last, and the last six months. */
export function ReceivedCard({
  dashboard: d,
  locale,
}: {
  dashboard: Dashboard
  locale: string
}) {
  const t = useTheme()
  const r = d.received
  if (!r) return null
  const cur = d.primaryCurrency
  const pick = <T extends { currency: string }>(xs: T[]) =>
    xs.find((x) => x.currency === cur) ?? xs[0]
  const now = pick(r.thisMonth)
  const before = pick(r.lastMonth)
  const currency = now?.currency ?? before?.currency ?? cur
  const months = r.monthly.find((m) => m.currency === currency)?.months ?? []
  const max = Math.max(1, ...months.map((m) => m.amount))
  const monthName = (ym: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
      new Date(`${ym.slice(0, 7)}-01T00:00:00Z`)
    )
  return (
    <Card>
      <View style={styles.head}>
        <Text variant="headline">Received</Text>
        <Text variant="caption" tone="muted">
          {currency}
        </Text>
      </View>
      <View style={styles.split}>
        <View style={styles.flex}>
          <Text variant="caption" tone="muted">
            This month
          </Text>
          <Amount
            value={now?.amount ?? 0}
            currency={currency}
            locale={locale}
            sign="in"
          />
          <Text variant="caption" tone="subtle">
            {`${now?.count ?? 0} ${now?.count === 1 ? "payment" : "payments"}`}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text variant="caption" tone="muted">
            Last month
          </Text>
          <Amount
            value={before?.amount ?? 0}
            currency={currency}
            locale={locale}
          />
          <Text variant="caption" tone="subtle">
            {`${before?.count ?? 0} ${before?.count === 1 ? "payment" : "payments"}`}
          </Text>
        </View>
      </View>
      {months.length > 0 ? (
        <View
          style={styles.spark}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Received per month, ${months.map((m) => `${monthName(m.month)} ${signedAmount(m.amount, currency, locale).text}`).join(", ")}`}
        >
          {months.map((m, i) => (
            <View key={m.month} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(2, (m.amount / max) * 44),
                    backgroundColor:
                      i === months.length - 1 ? t.primary : t.primarySoft,
                  },
                ]}
              />
              <Text variant="caption" tone="subtle" style={styles.x}>
                {monthName(m.month)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  )
}

// ── Your books ────────────────────────────────────────────────────────

/** The three most recently used books, and See all. */
export function BooksCard({ locale }: { locale: string }) {
  const books = useCashbooks()
  const top = (books.data ?? []).slice(0, 3)
  if (!books.data || top.length === 0) return null
  return (
    <View>
      <SectionHeader
        title="Your books"
        action={{
          label: "See all",
          onPress: () => router.navigate("/expenses"),
        }}
      />
      <ListGroup>
        {top.map((b) => (
          <ListItem
            key={b.id}
            title={b.name}
            subtitle={ago(b.lastActivityAt)}
            leading={<Avatar label={initialsOf(b.name)} size={40} />}
            trailing={
              <Amount
                value={b.balance}
                currency={b.currency}
                locale={locale}
                sign="auto"
              />
            }
            onPress={() =>
              router.push({ pathname: "/book/[id]", params: { id: b.id } })
            }
          />
        ))}
      </ListGroup>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space[2],
  },
  more: { flexDirection: "row", alignItems: "center", gap: 2 },
  split: { flexDirection: "row", gap: Space[4] },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: CHART_H + 18,
  },
  spark: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Space[2],
    height: 44 + 18,
  },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 4 },
  bar: {
    width: "100%",
    maxWidth: 22,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  x: { fontSize: 10, lineHeight: 12, height: 12 },
  projects: { gap: Space[2] },
  proj: { gap: 4 },
  projLine: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: Space[2],
  },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: "100%" },
  owed: { gap: Space[1] },
  aging: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    gap: 2,
    marginTop: Space[1],
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: Space[3] },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  swatch: { width: 8, height: 8, borderRadius: Radius.xs / 2 },
})
