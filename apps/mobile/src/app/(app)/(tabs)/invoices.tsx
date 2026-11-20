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
import { create } from "zustand"

import { InvoiceRow, totalsByCurrency } from "@/components/invoice-row"
import { QuoteRow } from "@/components/quote-row"
import { Body, Chip, Screen, Title } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import {
  INVOICE_FILTERS,
  useInvoiceFilter,
  useInvoices,
} from "@/features/invoices"
import { useMe } from "@/features/me"
import { QUOTE_FILTERS, type QuoteFilter, useQuotes } from "@/features/quotes"
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

const QUOTES_EMPTY: Record<QuoteFilter, string> = {
  sent: "No quotes waiting for an answer.",
  draft: "No draft quotes.",
  accepted: "No accepted quotes yet.",
  declined: "No declined quotes.",
  all: "No quotes yet. Write one on the web.",
}

type Pane = "invoices" | "quotes"

/** Kept outside the screen, so the tab reopens on the last half. */
const usePane = create<{
  pane: Pane
  quoteFilter: QuoteFilter
  setPane: (p: Pane) => void
  setQuoteFilter: (f: QuoteFilter) => void
}>((set) => ({
  pane: "invoices",
  quoteFilter: "sent",
  setPane: (pane) => set({ pane }),
  setQuoteFilter: (quoteFilter) => set({ quoteFilter }),
}))

/**
 * Who owes you what: unpaid invoices first, then the rest by filter. The
 * tab holds quotes too (a sixth tab would go under "More" on iPhone).
 */
export default function InvoicesScreen() {
  const t = useTheme()
  const me = useMe()
  const canInvoices = me.data?.permissions.includes("invoice.read") ?? false
  const canQuotes = me.data?.permissions.includes("quote.read") ?? false
  const { pane: picked, setPane, quoteFilter, setQuoteFilter } = usePane()
  const pane: Pane = !canInvoices ? "quotes" : !canQuotes ? "invoices" : picked
  const { filter, setFilter } = useInvoiceFilter()
  const list = useInvoices(filter, pane === "invoices" && canInvoices)
  const quotes = useQuotes(
    quoteFilter,
    undefined,
    pane === "quotes" && canQuotes
  )
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
                await (pane === "quotes" ? quotes.refetch() : list.refetch())
                setRefreshing(false)
              }}
            />
          }
        >
          <Title>{pane === "quotes" ? "Quotes" : "Invoices"}</Title>
          {canInvoices && canQuotes ? (
            <View style={styles.panes}>
              <Chip
                label="Invoices"
                selected={pane === "invoices"}
                onPress={() => setPane("invoices")}
              />
              <Chip
                label="Quotes"
                selected={pane === "quotes"}
                onPress={() => setPane("quotes")}
              />
            </View>
          ) : null}
          {pane === "quotes" ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={styles.chips}
              >
                {QUOTE_FILTERS.map((f) => (
                  <Chip
                    key={f.value}
                    label={f.label}
                    selected={quoteFilter === f.value}
                    onPress={() => setQuoteFilter(f.value)}
                  />
                ))}
              </ScrollView>
              {quotes.error ? (
                <Body>{errorMessage(quotes.error)}</Body>
              ) : !quotes.data ? (
                <Body muted>Loading…</Body>
              ) : quotes.data.items.length === 0 ? (
                <Body muted>{QUOTES_EMPTY[quoteFilter]}</Body>
              ) : (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: t.backgroundElement,
                      borderColor: t.border,
                    },
                  ]}
                >
                  {quotes.data.items.map((q, i) => (
                    <QuoteRow
                      key={q.id}
                      quote={q}
                      locale={locale}
                      today={today}
                      first={i === 0}
                    />
                  ))}
                </View>
              )}
              {quotes.data && quotes.data.total > quotes.data.items.length ? (
                <Body muted style={Type.small}>
                  Showing the latest 50. Find older quotes on the web.
                </Body>
              ) : null}
            </>
          ) : (
            <>
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
                    {
                      backgroundColor: t.backgroundElement,
                      borderColor: t.border,
                    },
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
            </>
          )}
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
  panes: { flexDirection: "row", gap: Spacing.two },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
})
