import { type CashbookEntry, formatMoney } from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { CashbookEntryRow } from "@/components/cashbook-entry-row"
import { Body, Chip, ClearableInput, Screen } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import {
  can,
  extraFilterCount,
  toApiFilter,
  useBookFilters,
  useCashbook,
  useCashbookEntries,
  useDeleteEntries,
  useFiltersFor,
} from "@/features/cashbook"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { dayHeading, DURATIONS, groupByDay, nowIn } from "@/lib/cashbook"

/**
 * One cashbook: the balance for the filters, entries grouped by day with
 * the running balance, and Cash in / Cash out at the bottom. Long-press
 * an entry to select several (delete, move or copy).
 */
export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const profile = useWorkspaceProfile()
  const locale =
    profile.data?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const today = nowIn(profile.data?.timezone).date
  const book = useCashbook(id)
  const b = book.data
  const filters = useFiltersFor(id)
  const setFilters = useBookFilters((s) => s.set)
  const filter = toApiFilter(filters, today)
  const entries = useCashbookEntries(id, filter)
  const remove = useDeleteEntries(id)
  const [refreshing, setRefreshing] = React.useState(false)
  const [search, setSearch] = React.useState(filters.q ?? "")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const selecting = selected.size > 0

  // Search as you type, without a request per key.
  React.useEffect(() => {
    const h = setTimeout(() => setFilters(id, { q: search }), 350)
    return () => clearTimeout(h)
  }, [search, id, setFilters])

  const items = React.useMemo(
    () => entries.data?.pages.flatMap((p) => p.items) ?? [],
    [entries.data]
  )
  const sections = React.useMemo(() => groupByDay(items), [items])
  const first = entries.data?.pages[0]
  const totals = first?.totals
  const count = first?.total ?? 0
  const currency = b?.currency ?? "USD"
  const money = (n: number) => formatMoney({ amount: n, currency }, locale)
  const extra = extraFilterCount(filters)
  const filtered = filters.duration !== "all" || extra > 0 || Boolean(filters.q)

  const toggle = (entryId: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })

  const open = (e: CashbookEntry) =>
    selecting
      ? toggle(e.id)
      : router.push({
          pathname: "/cashbook-entry",
          params: { bookId: id, entryId: e.id },
        })

  const deleteSelected = () => {
    const n = selected.size
    Alert.alert(
      `Delete ${n} ${n === 1 ? "entry" : "entries"}?`,
      "They leave the balance. The audit log keeps a record.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            remove.mutate([...selected], {
              onSuccess: () => setSelected(new Set()),
              onError: (e) => Alert.alert("Couldn't delete", errorMessage(e)),
            }),
        },
      ]
    )
  }

  const add = (type: "in" | "out") =>
    router.push({
      pathname: "/cashbook-entry-edit",
      params: { bookId: id, type },
    })

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: selecting
            ? `${selected.size} selected`
            : (b?.name ?? "Cashbook"),
          headerRight: () =>
            selecting ? (
              <HeaderLink label="Done" onPress={() => setSelected(new Set())} />
            ) : b ? (
              <HeaderLink
                label="Settings"
                onPress={() =>
                  router.push({ pathname: "/book-settings", params: { id } })
                }
              />
            ) : null,
        }}
      />
      <SafeAreaView style={styles.flex} edges={["bottom"]}>
        {book.error ? (
          <Body style={styles.pad}>{errorMessage(book.error)}</Body>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(e) => e.id}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true)
                  await Promise.all([book.refetch(), entries.refetch()])
                  setRefreshing(false)
                }}
              />
            }
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (entries.hasNextPage && !entries.isFetchingNextPage)
                void entries.fetchNextPage()
            }}
            ListHeaderComponent={
              <View style={styles.header}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.bleed}
                  contentContainerStyle={styles.chips}
                >
                  {DURATIONS.map((d) => (
                    <Chip
                      key={d.value}
                      label={d.label}
                      selected={filters.duration === d.value}
                      onPress={() => setFilters(id, { duration: d.value })}
                    />
                  ))}
                  <Chip
                    label={
                      filters.duration === "custom"
                        ? `${filters.from ?? "…"} – ${filters.to ?? "…"}`
                        : "Custom"
                    }
                    selected={filters.duration === "custom"}
                    onPress={() =>
                      router.push({ pathname: "/book-filters", params: { id } })
                    }
                  />
                </ScrollView>
                <View style={styles.searchRow}>
                  <ClearableInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search remark or amount"
                    placeholderTextColor={t.textSecondary}
                    clearButtonMode="while-editing"
                    returnKeyType="search"
                    accessibilityLabel="Search entries"
                    containerStyle={styles.flex}
                    style={[
                      styles.search,
                      {
                        color: t.text,
                        backgroundColor: t.backgroundElement,
                        borderColor: t.border,
                      },
                    ]}
                  />
                  <Chip
                    label={extra ? `Filters · ${extra}` : "Filters"}
                    selected={extra > 0}
                    onPress={() =>
                      router.push({ pathname: "/book-filters", params: { id } })
                    }
                  />
                </View>

                <View
                  style={[
                    styles.summary,
                    {
                      backgroundColor: t.backgroundElement,
                      borderColor: t.border,
                    },
                  ]}
                >
                  <View style={styles.line}>
                    <Text style={[Type.body, styles.bold, { color: t.text }]}>
                      {filtered ? "Net balance (filtered)" : "Net balance"}
                    </Text>
                    <Text
                      style={[
                        Type.heading,
                        styles.num,
                        { color: (totals?.net ?? 0) < 0 ? t.danger : t.text },
                      ]}
                    >
                      {totals
                        ? money(
                            filtered ? totals.net : (b?.balance ?? totals.net)
                          )
                        : "—"}
                    </Text>
                  </View>
                  <View style={styles.line}>
                    <Text style={[Type.small, { color: t.textSecondary }]}>
                      Total in (+)
                    </Text>
                    <Text style={[Type.body, styles.num, { color: t.primary }]}>
                      {totals ? money(totals.totalIn) : "—"}
                    </Text>
                  </View>
                  <View style={styles.line}>
                    <Text style={[Type.small, { color: t.textSecondary }]}>
                      Total out (−)
                    </Text>
                    <Text style={[Type.body, styles.num, { color: t.danger }]}>
                      {totals ? money(totals.totalOut) : "—"}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({ pathname: "/book-report", params: { id } })
                    }
                    style={({ pressed }) => [
                      styles.reports,
                      { borderTopColor: t.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text
                      style={[Type.body, styles.bold, { color: t.primary }]}
                    >
                      View reports ›
                    </Text>
                  </Pressable>
                </View>
                {b?.archivedAt ? (
                  <Body muted style={Type.small}>
                    This book is archived. Unarchive it in Settings to add
                    entries.
                  </Body>
                ) : null}
                <Text style={[Type.small, { color: t.textSecondary }]}>
                  {entries.isPending
                    ? "Loading…"
                    : `Showing ${count} ${count === 1 ? "entry" : "entries"}`}
                </Text>
              </View>
            }
            renderSectionHeader={({ section }) => (
              <Text
                accessibilityRole="header"
                style={[Type.small, styles.day, { color: t.textSecondary }]}
              >
                {dayHeading(section.date, locale, today)}
              </Text>
            )}
            renderItem={({ item }) => (
              <View style={styles.item}>
                <CashbookEntryRow
                  entry={item}
                  currency={currency}
                  locale={locale}
                  selected={selected.has(item.id)}
                  selecting={selecting}
                  onPress={() => open(item)}
                  onLongPress={() => toggle(item.id)}
                />
              </View>
            )}
            ListEmptyComponent={
              entries.error ? (
                <Body>{errorMessage(entries.error)}</Body>
              ) : entries.isPending ? undefined : (
                <Body muted style={styles.empty}>
                  {filtered
                    ? "No entries match these filters."
                    : can.addEntries(b)
                      ? "Add your first entry with Cash in or Cash out below."
                      : "No entries yet."}
                </Body>
              )
            }
            ListFooterComponent={
              entries.isFetchingNextPage ? (
                <Body muted style={styles.empty}>
                  Loading more…
                </Body>
              ) : undefined
            }
          />
        )}

        {selecting ? (
          <View
            style={[
              styles.bar,
              { borderTopColor: t.border, backgroundColor: t.background },
            ]}
          >
            {can.manage(b) ? (
              <BarButton
                label="Move or copy"
                color={t.text}
                border={t.border}
                onPress={() =>
                  router.push({
                    pathname: "/cashbook-transfer",
                    params: { bookId: id, entryIds: [...selected].join(",") },
                  })
                }
              />
            ) : null}
            <BarButton
              label={`Delete (${selected.size})`}
              color="#FFFFFF"
              background={t.danger}
              border={t.danger}
              onPress={deleteSelected}
            />
          </View>
        ) : can.addEntries(b) ? (
          <View
            style={[
              styles.bar,
              { borderTopColor: t.border, backgroundColor: t.background },
            ]}
          >
            <BarButton
              label="+ Cash in"
              color="#FFFFFF"
              background={t.primary}
              border={t.primary}
              onPress={() => add("in")}
            />
            <BarButton
              label="− Cash out"
              color="#FFFFFF"
              background={t.danger}
              border={t.danger}
              onPress={() => add("out")}
            />
          </View>
        ) : null}
      </SafeAreaView>
    </Screen>
  )
}

function HeaderLink({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable accessibilityRole="button" hitSlop={10} onPress={onPress}>
      <Text style={[Type.body, { color: t.primary, fontWeight: "600" }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function BarButton({
  label,
  color,
  background = "transparent",
  border,
  onPress,
}: {
  label: string
  color: string
  background?: string
  border: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.barButton,
        {
          backgroundColor: background,
          borderColor: border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[Type.body, { color, fontWeight: "700" }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.four },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.four },
  header: { gap: Spacing.three, paddingTop: Spacing.three },
  bleed: { marginHorizontal: -Spacing.three },
  chips: {
    flexDirection: "row",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  searchRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  search: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    fontSize: 16,
  },
  summary: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.one + 2,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  bold: { fontWeight: "600" },
  num: { fontVariant: ["tabular-nums"], fontWeight: "700" },
  reports: {
    borderTopWidth: 1,
    marginTop: Spacing.two,
    paddingVertical: Spacing.two + 2,
    alignItems: "center",
  },
  day: {
    fontWeight: "600",
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  item: { marginBottom: Spacing.two },
  empty: { textAlign: "center", marginTop: Spacing.four },
  bar: {
    flexDirection: "row",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    borderTopWidth: 1,
  },
  barButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
})
