import { type Expense, formatMoney } from "@workspace/contracts"
import { router } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import * as React from "react"
import { Alert, Pressable, StyleSheet, Text, View } from "react-native"

import { Body, Button, ErrorState } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import type { useRecentExpenses } from "@/features/expenses"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"

/** Recent expenses (redesigned with the rest of Expenses later). */
export function ExpensesPane({
  canCreate,
  list,
  locale,
}: {
  canCreate: boolean
  list: ReturnType<typeof useRecentExpenses>
  locale: string
}) {
  const t = useTheme()
  return (
    <>
      {canCreate ? (
        <Button
          title="Add expense"
          onPress={() => router.push("/expense-new")}
        />
      ) : null}
      <Text style={[Type.small, styles.heading, { color: t.textSecondary }]}>
        RECENT
      </Text>
      {list.error && !list.data ? (
        <ErrorState
          compact
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      ) : !list.data ? (
        <Body muted>Loading…</Body>
      ) : list.data.items.length === 0 ? (
        <Body muted>
          No expenses yet. Snap a receipt the next time you pay for something.
        </Body>
      ) : (
        <View
          style={[
            styles.card,
            { backgroundColor: t.backgroundElement, borderColor: t.border },
          ]}
        >
          {list.data.items.map((e, i) => (
            <ExpenseRow
              key={e.id}
              expense={e}
              locale={locale}
              first={i === 0}
            />
          ))}
        </View>
      )}
    </>
  )
}

function ExpenseRow({
  expense: e,
  locale,
  first,
}: {
  expense: Expense
  locale: string
  first: boolean
}) {
  const t = useTheme()
  const title = e.vendor || e.description || e.categoryName || "Expense"
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${e.spentOn}T00:00:00Z`))
  const sub = [date, e.categoryName].filter(Boolean).join(" · ")
  const receipt = e.receipt
  const open = () =>
    receipt &&
    WebBrowser.openBrowserAsync(receipt.url).catch((err) =>
      Alert.alert("Couldn't open the receipt", errorMessage(err))
    )
  return (
    <Pressable
      // The whole row opens the receipt: a bigger target than the word.
      accessibilityRole={receipt ? "button" : undefined}
      accessibilityLabel={`${title}, ${formatMoney({ amount: e.amount, currency: e.currency }, locale)}, ${sub}${receipt ? ". Opens the receipt" : ". No receipt"}`}
      disabled={!receipt}
      onPress={open}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: t.border },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={styles.flex}>
        <Text style={[Type.body, { color: t.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={[Type.small, { color: t.textSecondary }]}
          numberOfLines={1}
        >
          {sub}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[Type.body, styles.amount, { color: t.text }]}>
          {formatMoney({ amount: e.amount, currency: e.currency }, locale)}
        </Text>
        <Text
          style={[Type.small, { color: receipt ? t.primary : t.textSecondary }]}
        >
          {receipt ? "Receipt ›" : "No receipt"}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heading: { fontWeight: "600", marginTop: Spacing.two },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  right: { alignItems: "flex-end", gap: Spacing.half },
  amount: { fontWeight: "600", fontVariant: ["tabular-nums"] },
})
