import { formatMoney } from "@workspace/contracts"
import * as React from "react"
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { InvoiceRow, totalsByCurrency } from "@/components/invoice-row"
import { Body, Chip, Screen, Title } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import {
  INVOICE_FILTERS,
  useInvoiceFilter,
  useInvoices,
} from "@/features/invoices"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"

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
})
