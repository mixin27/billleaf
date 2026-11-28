import type { Permission } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import { create } from "zustand"

import { BookView } from "@/components/cashbook/book-view"
import { BooksList } from "@/components/cashbook/books-list"
import { ExpensesPane } from "@/components/expenses-pane"
import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  AppBar,
  EmptyState,
  Fab,
  RefreshControl,
  SegmentedControl,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import {
  cashbookKeys,
  type MoneyPane,
  moneyPanes,
  useCashbooks,
} from "@/features/cashbook"
import { useRecentExpenses } from "@/features/expenses"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useBreakpoint } from "@/hooks/use-breakpoint"
import { useTheme } from "@/hooks/use-theme"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { queryClient } from "@/lib/query-client"
import { useWorkspaceStore } from "@/stores/workspace-store"

const PANE_LABELS: Record<MoneyPane, string> = {
  cashbook: "Cashbook",
  expenses: "Expenses",
}

/** Kept outside the screen: the tab reopens on the last pane and book. */
const useMoney = create<{
  pane: MoneyPane
  book: string | null
  setPane: (p: MoneyPane) => void
  setBook: (id: string | null) => void
}>((set) => ({
  pane: "cashbook",
  book: null,
  setPane: (pane) => set({ pane }),
  setBook: (book) => set({ book }),
}))

/** Width of the books list beside an open book (wide tablets). */
const LIST_WIDTH = 380

/**
 * Money: cashbooks (daily cash in and out) and expenses. On a wide tablet
 * the books list and the open book sit side by side.
 */
export default function MoneyScreen() {
  const t = useTheme()
  const bp = useBreakpoint()
  const playerInset = useMiniPlayerInset()
  const me = useMe()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  const panes = moneyPanes(me.data?.permissions)
  const { pane: picked, setPane, book, setBook } = useMoney()
  const pane: MoneyPane = panes.includes(picked)
    ? picked
    : (panes[0] ?? "cashbook")
  const expenses = useRecentExpenses(pane === "expenses")
  const books = useCashbooks({ enabled: pane === "cashbook" })
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const has = (p: Permission) => me.data?.permissions.includes(p) ?? false
  const canCreateBook = has("cashbook.create")
  const [refreshing, setRefreshing] = React.useState(false)
  const split = bp === "expanded" && pane === "cashbook"

  const addBook = () => router.push("/book-new")
  // No books yet: the empty state's own "Add book" is the one action.
  const hasBooks = (books.data?.length ?? 0) > 0
  const fab =
    pane === "cashbook"
      ? canCreateBook && hasBooks
        ? { label: "Add book", onPress: addBook }
        : null
      : has("expense.create") && (expenses.data?.items.length ?? 0) > 0
        ? { label: "Add expense", onPress: () => router.push("/expense-new") }
        : null

  const list = (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        !split && styles.centred,
        { paddingBottom: Space[16] + Space[4] + playerInset },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true)
            await (pane === "expenses"
              ? expenses.refetch()
              : queryClient.invalidateQueries({
                  queryKey: cashbookKeys.all(ws),
                }))
            setRefreshing(false)
          }}
        />
      }
    >
      {panes.length > 1 ? (
        <SegmentedControl
          options={panes.map((p) => ({ value: p, label: PANE_LABELS[p] }))}
          value={pane}
          onChange={setPane}
        />
      ) : null}
      {pane === "cashbook" ? (
        <BooksList
          locale={locale}
          canCreate={canCreateBook}
          selectedId={split ? book : null}
          onOpen={(b) =>
            split
              ? setBook(b.id)
              : router.push({ pathname: "/book/[id]", params: { id: b.id } })
          }
          onAdd={addBook}
        />
      ) : (
        <ExpensesPane
          canCreate={has("expense.create")}
          list={expenses}
          locale={locale}
        />
      )}
    </ScrollView>
  )

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <AppBar title={panes.length === 1 ? PANE_LABELS[pane] : "Money"} />
      {split ? (
        <View style={styles.split}>
          <View style={[styles.listPane, { borderRightColor: t.border }]}>
            {list}
            {fab ? (
              <Fab
                label={fab.label}
                onPress={fab.onPress}
                bottom={Space[4] + playerInset}
              />
            ) : null}
          </View>
          <View style={styles.flex}>
            {book ? (
              <BookView id={book} embedded />
            ) : (
              <View style={styles.pick}>
                <EmptyState
                  icon="book"
                  title="Pick a book"
                  body="Its entries and balance open here."
                />
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.flex}>
          {list}
          {fab ? (
            <Fab
              label={fab.label}
              onPress={fab.onPress}
              bottom={Space[4] + playerInset}
            />
          ) : null}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: Space[4], gap: Space[3] },
  centred: { width: "100%", maxWidth: MAX_CONTENT_WIDTH, alignSelf: "center" },
  split: { flex: 1, flexDirection: "row" },
  listPane: { width: LIST_WIDTH, borderRightWidth: 1 },
  pick: { flex: 1, justifyContent: "center", padding: Space[8] },
})
