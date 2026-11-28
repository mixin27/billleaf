import { router } from "expo-router"
import * as React from "react"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"

import {
  AttentionCard,
  BooksCard,
  OwedCard,
  ReceivedCard,
  TimeCard,
} from "@/components/home/cards"
import { QuickActions } from "@/components/home/quick-actions"
import { TimeWalletCard, WalletCard } from "@/components/home/wallet-card"
import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  AppBar,
  Avatar,
  EmptyState,
  ErrorState,
  RefreshControl,
  SkeletonRows,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import { useDashboard, useMyTimeSummary } from "@/features/dashboard"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { authClient } from "@/lib/auth-client"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { nowIn } from "@/lib/cashbook"
import { initials } from "@/lib/format"
import { periodRange } from "@/lib/home"
import { canTrackTime, moneyPanes } from "@/lib/nav"
import { queryClient } from "@/lib/query-client"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** By the phone's own clock: it's where you are, not the workspace. */
function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

/**
 * Home: your money at a glance (wallet card), one-tap actions, what needs
 * you, your time, what you're owed and received, and your books. Only
 * the cards your role and plan can use show.
 */
export default function HomeScreen() {
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
  const session = authClient.useSession()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  const me = useMe()
  const profile = useWorkspaceProfile()
  const locale =
    profile.data?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const dashboard = useDashboard()
  const d = dashboard.data
  const today = d?.today
  const now = nowIn(profile.data?.timezone)
  const has = (p: string) =>
    (me.data?.permissions as string[] | undefined)?.includes(p) ?? false
  const cashbook = moneyPanes(me.data?.permissions).includes("cashbook")
  const canTrack = canTrackTime(me.data)
  // A role without cashbooks sees its week where the wallet card would be.
  const week = useMyTimeSummary(
    today ? periodRange("week", today) : undefined,
    canTrack && !cashbook
  )
  const [refreshing, setRefreshing] = React.useState(false)

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([
      me.refetch(),
      dashboard.refetch(),
      queryClient.invalidateQueries({ queryKey: ["cashbooks", ws] }),
      queryClient.invalidateQueries({ queryKey: ["time", ws] }),
      queryClient.invalidateQueries({ queryKey: ["approvals", ws] }),
    ])
    setRefreshing(false)
  }

  const user = session.data?.user
  const firstName = user?.name?.split(" ")[0]
  const dateLine = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${today ?? now.date}T00:00:00Z`))
  const nothing =
    d && me.data && !cashbook && !canTrack && !d.receivables && !d.received

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <AppBar
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        subtitle={dateLine}
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account"
            accessibilityHint="Appearance, notifications, the timer reminder and signing out"
            onPress={() => router.push("/account")}
            hitSlop={6}
          >
            <Avatar
              label={initials(user?.name, user?.email)}
              size={40}
              round
              tone="solid"
            />
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[8] + playerInset },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {dashboard.error && !d ? (
          <ErrorState
            error={dashboard.error}
            onRetry={() => void dashboard.refetch()}
          />
        ) : !d && dashboard.fetchStatus === "paused" ? (
          <EmptyState
            icon="offline"
            title="You're offline"
            body="Home fills in as soon as you're back online."
          />
        ) : null}

        {cashbook ? (
          <WalletCard locale={locale} today={today} />
        ) : canTrack ? (
          <TimeWalletCard
            total={week.data?.totalSeconds}
            billable={week.data?.billableSeconds}
            todaySeconds={
              week.data
                ? (week.data.byDay.find((x) => x.date === today)?.seconds ?? 0)
                : undefined
            }
          />
        ) : null}

        <QuickActions />

        <AttentionCard
          dashboard={d}
          locale={locale}
          today={today}
          canApprove={has("time.approve")}
          canTrack={canTrack}
        />

        {canTrack ? <TimeCard today={today} locale={locale} /> : null}

        {!d && !dashboard.error ? <SkeletonRows rows={3} /> : null}
        {d?.receivables ? <OwedCard dashboard={d} locale={locale} /> : null}
        {d?.received ? <ReceivedCard dashboard={d} locale={locale} /> : null}

        {cashbook ? <BooksCard locale={locale} /> : null}

        {nothing ? (
          <EmptyState
            icon="home"
            title="Nothing here for your role yet"
            body="Open Billleaf on the web for everything else."
          />
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Space[4],
    paddingTop: Space[2],
    gap: Space[5],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
})
