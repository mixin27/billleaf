import type { CashbookEntry } from "@workspace/contracts"
import { router, Stack } from "expo-router"
import * as React from "react"
import { ScrollView, SectionList, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  Amount,
  BottomActionBar,
  Button,
  Card,
  Chip,
  confirm,
  EmptyState,
  ErrorState,
  IconButton,
  RefreshControl,
  SearchField,
  SectionHeader,
  SkeletonRows,
  Text,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
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
import { haptic } from "@/lib/haptics"

import { EntryRow } from "./entry-row"

/**
 * One cashbook: search and date chips, the balance for what's shown,
 * entries by day with the running balance, and Cash in / Cash out at the
 * bottom. Long-press an entry to select several (move, copy, delete).
 * `embedded` draws its own title bar (the tablet split view); otherwise
 * it sets the stack header.
 */
export function BookView({ id, embedded }: { id: string; embedded?: boolean }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const playerInset = useMiniPlayerInset()
  const profile = useWorkspaceProfile()
  const locale =
    profile.data?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const today = nowIn(profile.data?.timezone).date
  const book = useCashbook(id)
  const b = book.data
  const filters = useFiltersFor(id)
  const setFilters = useBookFilters((s) => s.set)
  const entries = useCashbookEntries(id, toApiFilter(filters, today))
  const remove = useDeleteEntries(id)
  const [refreshing, setRefreshing] = React.useState(false)
  const [search, setSearch] = React.useState(filters.q ?? "")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const selecting = selected.size > 0

  // A different book (tablet split): start clean.
  React.useEffect(() => {
    setSelected(new Set())
    setSearch(useBookFilters.getState().byBook[id]?.q ?? "")
  }, [id])

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
  // Moved or deleted elsewhere: drop them from the selection.
  React.useEffect(() => {
    setSelected((s) => {
      if (s.size === 0) return s
      const ids = new Set(items.map((e) => e.id))
      const kept = [...s].filter((x) => ids.has(x))
      return kept.length === s.size ? s : new Set(kept)
    })
  }, [items])
  const first = entries.data?.pages[0]
  const totals = first?.totals
  const count = first?.total ?? 0
  const currency = b?.currency ?? "USD"
  const extra = extraFilterCount(filters)
  const filtered = filters.duration !== "all" || extra > 0 || Boolean(filters.q)
  const canAdd = can.addEntries(b)

  const toggle = (entryId: string) => {
    haptic.selection()
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }
  const open = (e: CashbookEntry) =>
    selecting
      ? toggle(e.id)
      : router.push({
          pathname: "/cashbook-entry",
          params: { bookId: id, entryId: e.id },
        })
  const add = (type: "in" | "out") =>
    router.push({
      pathname: "/cashbook-entry-edit",
      params: { bookId: id, type },
    })
  const go = (pathname: "/book-settings" | "/book-report" | "/book-filters") =>
    router.push({ pathname, params: { id } })

  const deleteSelected = async () => {
    const n = selected.size
    const ok = await confirm({
      title: `Delete ${n} ${n === 1 ? "entry" : "entries"}?`,
      message: "They come off the balance. The audit log keeps a record.",
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return
    remove.mutate([...selected], {
      onSuccess: () => {
        setSelected(new Set())
        toast.success(`${n} ${n === 1 ? "entry" : "entries"} deleted`)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const title = selecting
    ? `${selected.size} selected`
    : (b?.name ?? "Cashbook")
  const actions = selecting ? (
    <Button
      title="Done"
      variant="ghost"
      size="sm"
      fullWidth={false}
      onPress={() => setSelected(new Set())}
    />
  ) : b ? (
    <View style={styles.actions}>
      <IconButton
        icon="report"
        label="Reports"
        onPress={() => go("/book-report")}
      />
      <IconButton
        icon="settings"
        label="Book settings"
        onPress={() => go("/book-settings")}
      />
    </View>
  ) : null

  const bottomPad =
    (canAdd || selecting ? Space[4] : Space[4] + insets.bottom) + playerInset

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      {embedded ? (
        <View style={[styles.embeddedBar, { borderBottomColor: t.border }]}>
          <Text variant="headline" numberOfLines={1} style={styles.flex}>
            {title}
          </Text>
          {actions}
        </View>
      ) : (
        <Stack.Screen options={{ title, headerRight: () => actions }} />
      )}
      {book.error && !book.data ? (
        <View style={styles.pad}>
          <ErrorState error={book.error} onRetry={() => void book.refetch()} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => e.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
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
              <View style={styles.searchRow}>
                <View style={styles.flex}>
                  <SearchField
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search remark or amount"
                  />
                </View>
                <Chip
                  label={extra ? `Filters · ${extra}` : "Filters"}
                  icon="filter"
                  selected={extra > 0}
                  onPress={() => go("/book-filters")}
                />
              </View>
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
                  icon="calendar"
                  selected={filters.duration === "custom"}
                  onPress={() => go("/book-filters")}
                />
              </ScrollView>

              <Card>
                <View style={styles.line}>
                  <Text variant="label" tone="muted">
                    {filtered ? "Net balance (filtered)" : "Net balance"}
                  </Text>
                  <Text variant="caption" tone="subtle">
                    {currency}
                  </Text>
                </View>
                {totals ? (
                  <Amount
                    value={filtered ? totals.net : (b?.balance ?? totals.net)}
                    currency={currency}
                    locale={locale}
                    sign="auto"
                    size="xl"
                  />
                ) : (
                  <Text variant="display" tone="subtle">
                    —
                  </Text>
                )}
                <View style={styles.split}>
                  <View style={styles.flex}>
                    <Text variant="caption" tone="muted">
                      Total in
                    </Text>
                    {totals ? (
                      <Amount
                        value={totals.totalIn}
                        currency={currency}
                        locale={locale}
                        sign="in"
                      />
                    ) : null}
                  </View>
                  <View style={styles.flex}>
                    <Text variant="caption" tone="muted">
                      Total out
                    </Text>
                    {totals ? (
                      <Amount
                        value={totals.totalOut}
                        currency={currency}
                        locale={locale}
                        sign="out"
                      />
                    ) : null}
                  </View>
                </View>
                <Button
                  title="View report"
                  icon="report"
                  variant="tonal"
                  size="sm"
                  onPress={() => go("/book-report")}
                />
              </Card>

              {b?.archivedAt ? (
                <Text variant="callout" tone="muted">
                  This book is archived. Unarchive it in settings to add
                  entries.
                </Text>
              ) : null}
              {entries.data ? (
                <Text variant="caption" tone="muted">
                  {`${count} ${count === 1 ? "entry" : "entries"}`}
                </Text>
              ) : null}
            </View>
          }
          renderSectionHeader={({ section }) => (
            <SectionHeader title={dayHeading(section.date, locale, today)} />
          )}
          renderItem={({ item, index, section }) => (
            <EntryRow
              entry={item}
              currency={currency}
              locale={locale}
              first={index === 0}
              last={index === section.data.length - 1}
              selecting={selecting}
              selected={selected.has(item.id)}
              onPress={() => open(item)}
              onLongPress={() => toggle(item.id)}
            />
          )}
          ListEmptyComponent={
            entries.error && !entries.data ? (
              <ErrorState
                compact
                error={entries.error}
                onRetry={() => void entries.refetch()}
              />
            ) : !entries.data ? (
              <SkeletonRows rows={5} />
            ) : filtered ? (
              <EmptyState
                icon="filter"
                title="Nothing matches"
                body="No entries for these dates, search or filters."
                action={{
                  label: "Clear filters",
                  onPress: () => {
                    setSearch("")
                    useBookFilters.getState().reset(id)
                  },
                }}
              />
            ) : (
              <EmptyState
                icon="book"
                title="No entries yet"
                body={
                  canAdd
                    ? "Record money coming in and going out with the buttons below."
                    : "Entries show here once someone adds them."
                }
              />
            )
          }
          ListFooterComponent={
            entries.isFetchingNextPage ? <SkeletonRows rows={2} /> : undefined
          }
        />
      )}

      {selecting ? (
        <BottomActionBar>
          {can.manage(b) ? (
            <Button
              title="Move or copy"
              icon="move"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/cashbook-transfer",
                  params: { bookId: id, entryIds: [...selected].join(",") },
                })
              }
            />
          ) : null}
          <Button
            title={`Delete (${selected.size})`}
            icon="trash"
            variant="danger"
            loading={remove.isPending}
            onPress={deleteSelected}
          />
        </BottomActionBar>
      ) : canAdd ? (
        <BottomActionBar>
          <Button
            title="Cash in"
            icon="plus"
            variant="in"
            size="lg"
            onPress={() => add("in")}
          />
          <Button
            title="Cash out"
            icon="minus"
            variant="out"
            size="lg"
            onPress={() => add("out")}
          />
        </BottomActionBar>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Space[4] },
  list: { paddingHorizontal: Space[4] },
  header: { gap: Space[3], paddingTop: Space[3] },
  searchRow: { flexDirection: "row", alignItems: "center", gap: Space[2] },
  bleed: { marginHorizontal: -Space[4] },
  chips: { flexDirection: "row", gap: Space[2], paddingHorizontal: Space[4] },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  split: { flexDirection: "row", gap: Space[4] },
  actions: { flexDirection: "row" },
  embeddedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[2],
    minHeight: 56,
    paddingLeft: Space[4],
    paddingRight: Space[1],
    borderBottomWidth: 1,
  },
})
