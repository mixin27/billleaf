import { formatMoney, type InvoiceSummary } from "@workspace/contracts"
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

import { Body, Chip, Screen, Title } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import {
  INVOICE_FILTERS,
  INVOICE_STATUS_LABELS,
  useInvoiceFilter,
  useInvoices,
} from "@/features/invoices"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { shortDate } from "@/lib/format"

const EMPTY: Record<string, string> = {
  unpaid: "Nothing owed right now. Every issued invoice is paid.",
  overdue: "Nothing overdue.",
  draft: "No drafts.",
  paid: "No paid invoices yet.",
  all: "No invoices yet. Create one on the web.",
}

/** Who owes you what: unpaid invoices first, then the rest by filter. */
export default function InvoicesScreen() {
  const t = useTheme()
  const { filter, setFilter } = useInvoiceFilter()
  const list = useInvoices(filter)
  const today = useDashboard().data?.today
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const [refreshing, setRefreshing] = React.useState(false)

  // What's still owed, per currency (only for the unpaid views).
  const owed =
    list.items && (filter === "unpaid" || filter === "overdue")
      ? totalsByCurrency(list.items)
      : []

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
          <Title>Invoices</Title>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // Scroll edge to edge, lined up with the content.
            style={styles.bleed}
            contentContainerStyle={styles.chips}
          >
            {INVOICE_FILTERS.map((f) => (
              <Chip
                key={f.value}
                label={f.label}
                selected={filter === f.value}
                onPress={() => setFilter(f.value)}
              />
            ))}
          </ScrollView>

          {owed.length > 0 ? (
            <Text
              style={[Type.small, { color: t.textSecondary }]}
              accessibilityRole="summary"
            >
              {owed
                .map(
                  (o) =>
                    `${formatMoney({ amount: o.amount, currency: o.currency }, locale)} due`
                )
                .join(" · ")}
              {` on ${list.items!.length} invoice${list.items!.length === 1 ? "" : "s"}`}
            </Text>
          ) : null}

          {list.error ? (
            <Body>{errorMessage(list.error)}</Body>
          ) : !list.items ? (
            <Body muted>Loading…</Body>
          ) : list.items.length === 0 ? (
            <Body muted>{EMPTY[filter]}</Body>
          ) : (
            <View
              style={[
                styles.card,
                { backgroundColor: t.backgroundElement, borderColor: t.border },
              ]}
            >
              {list.items.map((inv, i) => (
                <InvoiceRow
                  key={inv.id}
                  invoice={inv}
                  locale={locale}
                  today={today}
                  first={i === 0}
                />
              ))}
            </View>
          )}
          {list.more ? (
            <Body muted style={Type.small}>
              Showing the latest 50. Find older invoices on the web.
            </Body>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  )
}

function totalsByCurrency(items: InvoiceSummary[]) {
  const m = new Map<string, number>()
  for (const i of items)
    m.set(i.currency, (m.get(i.currency) ?? 0) + i.amountDue)
  return [...m].map(([currency, amount]) => ({ currency, amount }))
}

function InvoiceRow({
  invoice: inv,
  locale,
  today,
  first,
}: {
  invoice: InvoiceSummary
  locale: string
  today: string | undefined
  first: boolean
}) {
  const t = useTheme()
  const owing = inv.displayStatus !== "paid" && inv.displayStatus !== "void"
  const amount = formatMoney(
    {
      amount: owing && inv.status === "issued" ? inv.amountDue : inv.total,
      currency: inv.currency,
    },
    locale
  )
  const when =
    inv.status === "issued" && owing && inv.dueDate
      ? `Due ${shortDate(inv.dueDate, locale, today)}`
      : shortDate(inv.issueDate, locale, today)
  const sub = [inv.number ?? "Draft", when].join(" · ")
  const status = INVOICE_STATUS_LABELS[inv.displayStatus]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${inv.clientName}, ${amount}, ${status}, ${sub}`}
      onPress={() =>
        router.push({ pathname: "/invoice/[id]", params: { id: inv.id } })
      }
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: t.border },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={styles.flex}>
        <Text style={[Type.body, { color: t.text }]} numberOfLines={1}>
          {inv.clientName}
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
          {amount}
        </Text>
        <Text
          style={[
            Type.small,
            {
              color:
                inv.displayStatus === "overdue"
                  ? t.danger
                  : inv.displayStatus === "paid"
                    ? t.primary
                    : t.textSecondary,
            },
          ]}
        >
          {status}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  bleed: { marginHorizontal: -Spacing.four },
  chips: { gap: Spacing.two, paddingHorizontal: Spacing.four },
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
