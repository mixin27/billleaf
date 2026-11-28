import { formatMoney, type Permission } from "@workspace/contracts"
import { Stack } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { ContractRow } from "@/components/contract-row"
import { InvoiceRow, totalsByCurrency } from "@/components/invoice-row"
import { useMiniPlayerInset } from "@/components/nav/mini-player"
import { QuoteRow } from "@/components/quote-row"
import {
  AppBar,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  type IconName,
  ListGroup,
  RefreshControl,
  SegmentedControl,
  SkeletonRows,
  Text,
} from "@/components/ui"
import { Space } from "@/constants/theme"
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
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { type SalesPane, useSalesPane as usePane } from "@/stores/panes"

type Empty = { title: string; body: string }

const EMPTY: Record<string, Empty> = {
  unpaid: {
    title: "Nothing owed right now",
    body: "Every issued invoice is paid.",
  },
  overdue: {
    title: "Nothing overdue",
    body: "Invoices past their due date show here.",
  },
  draft: { title: "No drafts", body: "Draft invoices show here." },
  paid: {
    title: "No paid invoices yet",
    body: "Invoices show here once they're paid.",
  },
  all: { title: "No invoices yet", body: "Create one on the web." },
}

const QUOTES_EMPTY: Record<QuoteFilter, Empty> = {
  sent: {
    title: "No quotes waiting",
    body: "No quotes waiting for an answer.",
  },
  draft: { title: "No draft quotes", body: "Draft quotes show here." },
  accepted: {
    title: "No accepted quotes yet",
    body: "Quotes your clients accept show here.",
  },
  declined: {
    title: "No declined quotes",
    body: "Quotes your clients decline show here.",
  },
  all: { title: "No quotes yet", body: "Write one on the web." },
}

const CONTRACTS_EMPTY: Record<ContractFilter, Empty> = {
  sent: {
    title: "No contracts waiting",
    body: "No contracts waiting for a signature.",
  },
  draft: { title: "No draft contracts", body: "Draft contracts show here." },
  signed: {
    title: "No signed contracts yet",
    body: "Contracts show here once they're signed.",
  },
  all: { title: "No contracts yet", body: "Write one on the web." },
}

type Pane = SalesPane

const PANE_LABELS: Record<Pane, string> = {
  invoices: "Invoices",
  quotes: "Quotes",
  contracts: "Contracts",
}

const PANE_ICONS: Record<Pane, IconName> = {
  invoices: "invoice",
  quotes: "quote",
  contracts: "contract",
}

/**
 * Who owes you what: unpaid invoices first, then the rest by filter. The
 * tab holds quotes and contracts too (a sixth tab would go under "More"
 * on iPhone).
 */
export default function InvoicesScreen() {
  return <SalesView />
}

/** Who owes you what, and your quotes and contracts. `stacked`: pushed from More or Home, with a back button. */
export function SalesView({ stacked }: { stacked?: boolean }) {
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
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      {stacked ? (
        <Stack.Screen options={{ title: PANE_LABELS[pane] }} />
      ) : (
        <AppBar title={PANE_LABELS[pane]} />
      )}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[6] + playerInset },
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
        {panes.length > 1 ? (
          <SegmentedControl
            options={panes.map((p) => ({ value: p, label: PANE_LABELS[p] }))}
            value={pane}
            onChange={setPane}
          />
        ) : null}
        {pane === "contracts" ? (
          <>
            <FilterChips
              filters={CONTRACT_FILTERS}
              value={contractFilter}
              onChange={setContractFilter}
            />
            {contracts.error && !contracts.data ? (
              <ErrorState
                error={contracts.error}
                onRetry={() => void contracts.refetch()}
              />
            ) : !contracts.data ? (
              <SkeletonRows rows={5} />
            ) : contracts.data.items.length === 0 ? (
              <EmptyState
                icon={PANE_ICONS.contracts}
                {...CONTRACTS_EMPTY[contractFilter]}
              />
            ) : (
              <ListGroup>
                {contracts.data.items.map((c) => (
                  <ContractRow
                    key={c.id}
                    contract={c}
                    locale={locale}
                    today={today}
                  />
                ))}
              </ListGroup>
            )}
            {contracts.data &&
            contracts.data.total > contracts.data.items.length ? (
              <MoreNote>
                Showing the latest 50. Find older contracts on the web.
              </MoreNote>
            ) : null}
          </>
        ) : pane === "quotes" ? (
          <>
            <FilterChips
              filters={QUOTE_FILTERS}
              value={quoteFilter}
              onChange={setQuoteFilter}
            />
            {quotes.error && !quotes.data ? (
              <ErrorState
                error={quotes.error}
                onRetry={() => void quotes.refetch()}
              />
            ) : !quotes.data ? (
              <SkeletonRows rows={5} />
            ) : quotes.data.items.length === 0 ? (
              <EmptyState
                icon={PANE_ICONS.quotes}
                {...QUOTES_EMPTY[quoteFilter]}
              />
            ) : (
              <ListGroup>
                {quotes.data.items.map((q) => (
                  <QuoteRow
                    key={q.id}
                    quote={q}
                    locale={locale}
                    today={today}
                  />
                ))}
              </ListGroup>
            )}
            {quotes.data && quotes.data.total > quotes.data.items.length ? (
              <MoreNote>
                Showing the latest 50. Find older quotes on the web.
              </MoreNote>
            ) : null}
          </>
        ) : (
          <>
            <FilterChips
              filters={INVOICE_FILTERS}
              value={filter}
              onChange={setFilter}
            />

            {owed.length > 0 && list.items ? (
              <OwedCard owed={owed} count={list.items.length} locale={locale} />
            ) : null}

            {list.error && !list.items ? (
              <ErrorState
                error={list.error}
                onRetry={() => void list.refetch()}
              />
            ) : !list.items ? (
              <SkeletonRows rows={5} />
            ) : list.items.length === 0 ? (
              <EmptyState icon={PANE_ICONS.invoices} {...EMPTY[filter]!} />
            ) : (
              <ListGroup>
                {list.items.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    locale={locale}
                    today={today}
                  />
                ))}
              </ListGroup>
            )}
            {list.more ? (
              <MoreNote>
                Showing the latest 50. Find older invoices on the web.
              </MoreNote>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  )
}

/** One row of filter chips that scrolls edge to edge, lined up with the content. */
function FilterChips<V extends string>({
  filters,
  value,
  onChange,
}: {
  filters: { value: V; label: string }[]
  value: V
  onChange: (v: V) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bleed}
      contentContainerStyle={styles.chips}
    >
      {filters.map((f) => (
        <Chip
          key={f.value}
          label={f.label}
          selected={value === f.value}
          onPress={() => onChange(f.value)}
        />
      ))}
    </ScrollView>
  )
}

/** What's still owed on the listed invoices, per currency. */
function OwedCard({
  owed,
  count,
  locale,
}: {
  owed: { currency: string; amount: number }[]
  count: number
  locale: string
}) {
  const amounts = owed.map((o) =>
    formatMoney({ amount: o.amount, currency: o.currency }, locale)
  )
  const on = `on ${count} invoice${count === 1 ? "" : "s"}`
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${amounts.map((a) => `${a} due`).join(", ")} ${on}`}
    >
      <Card>
        <View style={styles.owed}>
          <Text variant="overline" tone="muted">
            Due
          </Text>
          {amounts.map((a) => (
            <Text key={a} variant="title" numeric>
              {a}
            </Text>
          ))}
          <Text variant="callout" tone="muted">
            {on}
          </Text>
        </View>
      </Card>
    </View>
  )
}

function MoreNote({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="muted" style={styles.center}>
      {children}
    </Text>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Space[4],
    paddingTop: Space[2],
    gap: Space[4],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  bleed: { marginHorizontal: -Space[4], flexGrow: 0 },
  chips: { gap: Space[2], paddingHorizontal: Space[4] },
  owed: { gap: Space[1] },
  center: { textAlign: "center" },
})
