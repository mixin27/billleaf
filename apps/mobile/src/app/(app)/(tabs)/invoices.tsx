import { formatMoney, type Permission } from "@workspace/contracts"
import * as React from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { ContractRow } from "@/components/contract-row"
import { InvoiceRow, totalsByCurrency } from "@/components/invoice-row"
import { QuoteRow } from "@/components/quote-row"
import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  Body,
  Chip,
  Screen,
  Title,
  ErrorState,
  RefreshControl,
} from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import {
  CONTRACT_FILTERS,
  type ContractFilter,
  useContracts,
} from "@/features/contracts"
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
import { type SalesPane, useSalesPane as usePane } from "@/stores/panes"

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

const CONTRACTS_EMPTY: Record<ContractFilter, string> = {
  sent: "No contracts waiting for a signature.",
  draft: "No draft contracts.",
  signed: "No signed contracts yet.",
  all: "No contracts yet. Write one on the web.",
}

type Pane = SalesPane

const PANE_LABELS: Record<Pane, string> = {
  invoices: "Invoices",
  quotes: "Quotes",
  contracts: "Contracts",
}

/**
 * Who owes you what: unpaid invoices first, then the rest by filter. The
 * tab holds quotes and contracts too (a sixth tab would go under "More"
 * on iPhone).
 */
export default function InvoicesScreen() {
  const playerInset = useMiniPlayerInset()
  const t = useTheme()
  const me = useMe()
  const has = (p: Permission) => me.data?.permissions.includes(p) ?? false
  const canInvoices = has("invoice.read")
  const canQuotes = has("quote.read")
  const canContracts = has("contract.read")
  const panes = (["invoices", "quotes", "contracts"] as const).filter((p) =>
    p === "invoices" ? canInvoices : p === "quotes" ? canQuotes : canContracts
  )
  const {
    pane: picked,
    setPane,
    quoteFilter,
    setQuoteFilter,
    contractFilter,
    setContractFilter,
  } = usePane()
  const pane: Pane = panes.includes(picked as never)
    ? picked
    : (panes[0] ?? "invoices")
  const { filter, setFilter } = useInvoiceFilter()
  const list = useInvoices(filter, pane === "invoices" && canInvoices)
  const quotes = useQuotes(
    quoteFilter,
    undefined,
    pane === "quotes" && canQuotes
  )
  const contracts = useContracts(
    contractFilter,
    undefined,
    pane === "contracts" && canContracts
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
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Spacing.four + playerInset },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true)
                await (pane === "quotes"
                  ? quotes.refetch()
                  : pane === "contracts"
                    ? contracts.refetch()
                    : list.refetch())
                setRefreshing(false)
              }}
            />
          }
        >
          <Title>{PANE_LABELS[pane]}</Title>
          {panes.length > 1 ? (
            <View style={styles.panes}>
              {panes.map((p) => (
                <Chip
                  key={p}
                  label={PANE_LABELS[p]}
                  selected={pane === p}
                  onPress={() => setPane(p)}
                />
              ))}
            </View>
          ) : null}
          {pane === "contracts" ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={styles.chips}
              >
                {CONTRACT_FILTERS.map((f) => (
                  <Chip
                    key={f.value}
                    label={f.label}
                    selected={contractFilter === f.value}
                    onPress={() => setContractFilter(f.value)}
                  />
                ))}
              </ScrollView>
              {contracts.error && !contracts.data ? (
                <ErrorState
                  compact
                  error={contracts.error}
                  onRetry={() => void contracts.refetch()}
                />
              ) : !contracts.data ? (
                <Body muted>Loading…</Body>
              ) : contracts.data.items.length === 0 ? (
                <Body muted>{CONTRACTS_EMPTY[contractFilter]}</Body>
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
                  {contracts.data.items.map((c, i) => (
                    <ContractRow
                      key={c.id}
                      contract={c}
                      locale={locale}
                      today={today}
                      first={i === 0}
                    />
                  ))}
                </View>
              )}
              {contracts.data &&
              contracts.data.total > contracts.data.items.length ? (
                <Body muted style={Type.small}>
                  Showing the latest 50. Find older contracts on the web.
                </Body>
              ) : null}
            </>
          ) : pane === "quotes" ? (
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
              {quotes.error && !quotes.data ? (
                <ErrorState
                  compact
                  error={quotes.error}
                  onRetry={() => void quotes.refetch()}
                />
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

              {list.error && !list.items ? (
                <ErrorState
                  compact
                  error={list.error}
                  onRetry={() => void list.refetch()}
                />
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
