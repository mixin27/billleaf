import { type Expense, formatMoney } from "@workspace/contracts"
import { router } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import * as React from "react"
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Body, Button, Screen, Title } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useRecentExpenses } from "@/features/expenses"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"

/** Recent expenses and the way in to recording one (with its receipt). */
export default function ExpensesScreen() {
  const t = useTheme()
  const me = useMe()
  const list = useRecentExpenses()
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const canCreate = me.data?.permissions.includes("expense.create") ?? false
  const [refreshing, setRefreshing] = React.useState(false)

  return (
    <Screen>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true)
                await list.refetch()
                setRefreshing(false)
              }}
            />
          }
        >
          <Title>Expenses</Title>
          {canCreate ? (
            <Button
              title="Add expense"
              onPress={() => router.push("/expense-new")}
            />
          ) : null}
          <Text
            style={[Type.small, styles.heading, { color: t.textSecondary }]}
          >
            RECENT
          </Text>
          {list.error ? (
            <Body>{errorMessage(list.error)}</Body>
          ) : !list.data ? (
            <Body muted>Loading…</Body>
          ) : list.data.items.length === 0 ? (
            <Body muted>
              No expenses yet. Snap a receipt the next time you pay for
              something.
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
        </ScrollView>
      </SafeAreaView>
    </Screen>
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
  content: { padding: Spacing.four, gap: Spacing.three },
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
