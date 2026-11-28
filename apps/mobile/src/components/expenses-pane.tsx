import { type Expense } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import {
  Amount,
  Chip,
  EmptyState,
  ErrorState,
  IconTile,
  ListGroup,
  ListItem,
  SectionHeader,
  SkeletonRows,
  Text,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import type { useRecentExpenses } from "@/features/expenses"
import { signedAmount } from "@/lib/money-display"

/** "2026-11" → "November 2026" (or the locale's own). */
function monthName(ym: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ym}-01T00:00:00Z`))
}

/**
 * Your latest expenses, by month with each month's total, newest first.
 * Filter by category; tap one for its details and receipt.
 */
export function ExpensesPane({
  list,
  locale,
  canCreate,
}: {
  list: ReturnType<typeof useRecentExpenses>
  locale: string
  canCreate: boolean
}) {
  const [category, setCategory] = React.useState<string | null>(null)
  const items = list.data?.items ?? []
  const categories = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of items)
      if (e.categoryId && e.categoryName) seen.set(e.categoryId, e.categoryName)
    return [...seen.entries()]
  }, [items])
  const shown = category
    ? items.filter((e) => e.categoryId === category)
    : items
  const months = React.useMemo(() => {
    const out: { month: string; items: Expense[] }[] = []
    for (const e of shown) {
      const m = e.spentOn.slice(0, 7)
      const last = out[out.length - 1]
      if (last?.month === m) last.items.push(e)
      else out.push({ month: m, items: [e] })
    }
    return out
  }, [shown])

  if (list.error && !list.data)
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  if (!list.data) return <SkeletonRows rows={4} />
  if (items.length === 0)
    return (
      <EmptyState
        icon="receipt"
        title="No expenses yet"
        body={
          canCreate
            ? "Snap a receipt the next time you pay for something for work."
            : "Expenses recorded on the web show here."
        }
        action={
          canCreate
            ? {
                label: "Add expense",
                icon: "plus",
                onPress: () => router.push("/expense-new"),
              }
            : undefined
        }
      />
    )

  return (
    <View style={styles.gap}>
      {categories.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label="All"
            selected={!category}
            onPress={() => setCategory(null)}
          />
          {categories.map(([id, name]) => (
            <Chip
              key={id}
              label={name}
              selected={category === id}
              onPress={() => setCategory(id)}
            />
          ))}
        </ScrollView>
      ) : null}
      {months.map(({ month, items: rows }) => {
        const totals = new Map<string, number>()
        for (const e of rows)
          totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount)
        return (
          <View key={month}>
            <SectionHeader
              title={monthName(month, locale)}
              trailing={
                <Text variant="label" tone="muted" numeric>
                  {[...totals.entries()]
                    .map(([c, n]) => `${c} ${signedAmount(n, c, locale).text}`)
                    .join(" · ")}
                </Text>
              }
            />
            <ListGroup>
              {rows.map((e) => (
                <ExpenseRow key={e.id} expense={e} locale={locale} />
              ))}
            </ListGroup>
          </View>
        )
      })}
    </View>
  )
}

function ExpenseRow({
  expense: e,
  locale,
}: {
  expense: Expense
  locale: string
}) {
  const title = e.vendor || e.description || e.categoryName || "Expense"
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${e.spentOn}T00:00:00Z`))
  const sub = [date, e.vendor ? e.categoryName : null]
    .filter(Boolean)
    .join(" · ")
  return (
    <ListItem
      title={title}
      subtitle={sub}
      leading={
        <IconTile icon="receipt" tone={e.receipt ? "primary" : "neutral"} />
      }
      trailing={
        <>
          <Amount value={e.amount} currency={e.currency} locale={locale} />
          <Text variant="caption" tone={e.receipt ? "subtle" : "out"}>
            {e.receipt ? e.currency : "No receipt"}
          </Text>
        </>
      }
      accessibilityLabel={`${title}, ${e.currency} ${signedAmount(e.amount, e.currency, locale).text}, ${sub}${e.receipt ? "" : ", no receipt"}`}
      onPress={() =>
        router.push({ pathname: "/expense/[id]", params: { id: e.id } })
      }
    />
  )
}

const styles = StyleSheet.create({
  gap: { gap: Space[2] },
  bleed: { marginHorizontal: -Space[4], flexGrow: 0 },
  chips: { gap: Space[2], paddingHorizontal: Space[4] },
})
