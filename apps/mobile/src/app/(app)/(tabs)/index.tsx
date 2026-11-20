import { formatDuration, formatMoney } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Body, Screen, Title } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useDashboard, useWeekTime } from "@/features/dashboard"
import { useInvoiceFilter } from "@/features/invoices"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { initials } from "@/lib/format"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** Home: this week's time and what you're owed, for the active workspace. */
export default function DashboardScreen() {
  const t = useTheme()
  const session = authClient.useSession()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const me = useMe()
  // Money reads the way it does on your invoices (the workspace locale).
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const dashboard = useDashboard()
  const tracksTime = me.data?.plan.features.timeTracking ?? false
  const week = useWeekTime(tracksTime ? dashboard.data?.today : undefined)
  const [refreshing, setRefreshing] = React.useState(false)

  const refresh = async () => {
    setRefreshing(true)
    // refetch() ignores `enabled`, so only refresh the week when it's shown.
    await Promise.all([
      me.refetch(),
      dashboard.refetch(),
      tracksTime && dashboard.data ? week.refetch() : null,
    ])
    setRefreshing(false)
  }

  const d = dashboard.data
  const error = me.error ?? dashboard.error ?? week.error
  const firstName = session.data?.user.name?.split(" ")[0]

  return (
    <Screen>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
        >
          <View style={styles.top}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Workspace ${workspace?.name}. Switch workspace`}
              onPress={() => router.push("/workspaces")}
              style={({ pressed }) => [
                styles.switcher,
                { borderColor: t.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text
                style={[Type.small, styles.bold, { color: t.text }]}
                numberOfLines={1}
              >
                {workspace?.name}
              </Text>
              <Text style={[Type.small, { color: t.textSecondary }]}>
                Switch ▾
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Account"
              accessibilityHint="Your account, the timer reminder and signing out"
              onPress={() => router.push("/account")}
              hitSlop={6}
              style={({ pressed }) => [
                styles.avatar,
                { backgroundColor: t.primary, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[Type.small, styles.bold, { color: t.onPrimary }]}>
                {initials(session.data?.user.name, session.data?.user.email)}
              </Text>
            </Pressable>
          </View>
          <Title>{firstName ? `Hi, ${firstName}` : "Hi there"}</Title>

          {error ? (
            <Card>
              <Body>{errorMessage(error)}</Body>
            </Card>
          ) : null}

          {tracksTime ? (
            <Card title="This week">
              {week.data ? (
                <View style={styles.stats}>
                  <Stat
                    label="Tracked"
                    value={formatDuration(week.data.totalSeconds)}
                  />
                  <Stat
                    label="Billable"
                    value={formatDuration(week.data.billableSeconds)}
                  />
                </View>
              ) : (
                <Body muted>Loading…</Body>
              )}
            </Card>
          ) : null}

          {d?.receivables ? (
            <Card
              title="Outstanding"
              // Opens the unpaid invoices (when you can see them).
              onPress={
                me.data?.permissions.includes("invoice.read")
                  ? () => {
                      useInvoiceFilter.getState().setFilter("unpaid")
                      router.navigate("/invoices")
                    }
                  : undefined
              }
            >
              {d.receivables.totals.length === 0 ? (
                <Body muted>Nothing owed right now.</Body>
              ) : (
                d.receivables.totals.map((r) => (
                  <View key={r.currency} style={styles.stats}>
                    <Stat
                      label={`${r.openCount} open`}
                      value={formatMoney(
                        { amount: r.outstanding, currency: r.currency },
                        locale
                      )}
                    />
                    <Stat
                      label={`${r.overdueCount} overdue`}
                      value={formatMoney(
                        { amount: r.overdue, currency: r.currency },
                        locale
                      )}
                      tone={r.overdue > 0 ? "danger" : undefined}
                    />
                  </View>
                ))
              )}
            </Card>
          ) : null}

          {d?.received ? (
            <Card title="Received this month">
              {d.received.thisMonth.length === 0 ? (
                <Body muted>No payments yet this month.</Body>
              ) : (
                d.received.thisMonth.map((r) => (
                  <Stat
                    key={r.currency}
                    label={`${r.count} payment${r.count === 1 ? "" : "s"}`}
                    value={formatMoney(
                      { amount: r.amount, currency: r.currency },
                      locale
                    )}
                  />
                ))
              )}
            </Card>
          ) : null}

          {d && !tracksTime && !d.receivables && !d.received ? (
            <Body muted>
              Nothing to show for your role here yet. Open Billleaf on the web
              for everything else.
            </Body>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  )
}

function Card({
  title,
  onPress,
  children,
}: {
  title?: string
  /** Makes the whole card a button (with a › after the title). */
  onPress?: () => void
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityHint={onPress ? `Opens ${title}` : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.backgroundElement,
          borderColor: t.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {title ? (
        <View style={styles.cardHead}>
          <Text
            accessibilityRole="header"
            style={[Type.small, styles.bold, { color: t.textSecondary }]}
          >
            {title.toUpperCase()}
          </Text>
          {onPress ? (
            <Text style={[Type.small, styles.bold, { color: t.primary }]}>
              View ›
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </Pressable>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "danger"
}) {
  const t = useTheme()
  return (
    <View
      style={styles.stat}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text
        style={[styles.value, { color: tone === "danger" ? t.danger : t.text }]}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text style={[Type.small, { color: t.textSecondary }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  bold: { fontWeight: "600" },
  cardHead: { flexDirection: "row", justifyContent: "space-between" },
  switcher: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: Spacing.two,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    flexShrink: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  stats: { flexDirection: "row", gap: Spacing.three },
  stat: { flex: 1, gap: Spacing.half },
  value: { fontSize: 24, fontWeight: "700", fontVariant: ["tabular-nums"] },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
})
