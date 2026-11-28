import {
  type ClientContact,
  type ClientDetail,
  formatMoney,
  type InvoiceSummary,
  type Permission,
} from "@workspace/contracts"
import { Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native"

import { ContractRow } from "@/components/contract-row"
import { InvoiceRow, totalsByCurrency } from "@/components/invoice-row"
import { useMiniPlayerInset } from "@/components/nav/mini-player"
import { ProjectRow } from "@/components/project-row"
import { QuoteRow } from "@/components/quote-row"
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  IconButton,
  initialsOf,
  KeyValue,
  ListGroup,
  ListItem,
  RefreshControl,
  SectionHeader,
  Skeleton,
  SkeletonRows,
  Text,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import { useClient } from "@/features/clients"
import { useContracts } from "@/features/contracts"
import { useDashboard } from "@/features/dashboard"
import { useClientInvoices } from "@/features/invoices"
import { useMe } from "@/features/me"
import { useProjects } from "@/features/projects"
import { useQuotes } from "@/features/quotes"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"

/** Opens the phone, mail, maps or browser app; says so when there's none. */
async function open(url: string) {
  try {
    await Linking.openURL(url)
  } catch {
    toast.error("Couldn't open it. No app on this phone can open that.")
  }
}
const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`
const mailto = (email: string) => `mailto:${email}`
const maps = (address: string) =>
  Platform.OS === "ios"
    ? `maps:?q=${encodeURIComponent(address)}`
    : `geo:0,0?q=${encodeURIComponent(address)}`
const web = (url: string) =>
  /^https?:\/\//i.test(url) ? url : `https://${url}`

/**
 * One client: how to reach them, what they owe, their invoices, quotes,
 * contracts and projects.
 * Adding and editing clients and contacts stays on the web.
 */
export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
  const me = useMe()
  const can = (p: Permission) => me.data?.permissions.includes(p) ?? false
  const client = useClient(id)
  const invoices = useClientInvoices(id, can("invoice.read"))
  const projects = useProjects({ clientId: id }, can("project.read"))
  const quotes = useQuotes("all", id, can("quote.read"))
  const contracts = useContracts("all", id, can("contract.read"))
  const profile = useWorkspaceProfile().data
  const today = useDashboard().data?.today
  const locale =
    profile?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const [refreshing, setRefreshing] = React.useState(false)
  const c = client.data

  const rows = (items: InvoiceSummary[]) => (
    <ListGroup>
      {items.map((inv, i) => (
        <InvoiceRow
          key={inv.id}
          invoice={inv}
          locale={locale}
          today={today}
          first={i === 0}
          byNumber
        />
      ))}
    </ListGroup>
  )

  const liveProjects =
    projects.data?.items.filter((p) => p.status !== "archived") ?? []

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <Stack.Screen options={{ title: c?.name ?? "Client" }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[8] + playerInset },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await Promise.all([
                client.refetch(),
                can("invoice.read") ? invoices.refetch() : null,
                can("project.read") ? projects.refetch() : null,
                can("quote.read") ? quotes.refetch() : null,
                can("contract.read") ? contracts.refetch() : null,
              ])
              setRefreshing(false)
            }}
          />
        }
      >
        {client.error && !client.data ? (
          <ErrorState
            error={client.error}
            onRetry={() => void client.refetch()}
          />
        ) : !c ? (
          <>
            <Card>
              <Skeleton width="60%" height={22} />
              <Skeleton width="30%" height={12} />
              <Skeleton width="45%" height={28} />
            </Card>
            <SkeletonRows rows={3} />
          </>
        ) : (
          <>
            <Card>
              <Header client={c} />
              <Reach client={c} />
              {!can("invoice.read") ? null : invoices.error &&
                !invoices.unpaid ? null : !invoices.unpaid ||
                !invoices.recent ? (
                <View style={styles.gap} accessibilityLabel="Loading invoices">
                  <Skeleton width="25%" height={12} />
                  <Skeleton width="50%" height={28} />
                </View>
              ) : (
                <Owed unpaid={invoices.unpaid} locale={locale} name={c.name} />
              )}
            </Card>

            {can("invoice.read") && invoices.error && !invoices.unpaid ? (
              <ErrorState
                compact
                error={invoices.error}
                onRetry={() => void invoices.refetch()}
              />
            ) : null}

            {can("invoice.read") && invoices.unpaid?.length ? (
              <View>
                <SectionHeader title="Unpaid" />
                {rows(invoices.unpaid)}
              </View>
            ) : null}
            {can("invoice.read") && invoices.recent?.length ? (
              <View>
                <SectionHeader title="Recent invoices" />
                {rows(invoices.recent)}
              </View>
            ) : null}

            {c.contacts.length > 0 ? (
              <View>
                <SectionHeader title="Contacts" />
                <ListGroup>
                  {c.contacts.map((p) => (
                    <Contact key={p.id} contact={p} />
                  ))}
                </ListGroup>
              </View>
            ) : null}

            <View>
              <SectionHeader title="Details" />
              <Details
                client={c}
                currency={profile?.defaultCurrency}
                terms={profile?.paymentTermsDays}
              />
            </View>

            {can("quote.read") && quotes.data?.items.length ? (
              <View>
                <SectionHeader title="Quotes" />
                <ListGroup>
                  {quotes.data.items.slice(0, 5).map((q, i) => (
                    <QuoteRow
                      key={q.id}
                      quote={q}
                      locale={locale}
                      today={today}
                      first={i === 0}
                      byNumber
                    />
                  ))}
                </ListGroup>
              </View>
            ) : null}

            {can("contract.read") && contracts.data?.items.length ? (
              <View>
                <SectionHeader title="Contracts" />
                <ListGroup>
                  {contracts.data.items.slice(0, 5).map((k, i) => (
                    <ContractRow
                      key={k.id}
                      contract={k}
                      locale={locale}
                      today={today}
                      first={i === 0}
                      byTitle
                    />
                  ))}
                </ListGroup>
              </View>
            ) : null}

            {can("project.read") && liveProjects.length > 0 ? (
              <View>
                <SectionHeader title="Projects" />
                <ListGroup>
                  {liveProjects.map((p, i) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      first={i === 0}
                      locale={locale}
                      today={today}
                      noClient
                    />
                  ))}
                </ListGroup>
              </View>
            ) : null}

            {c.notes ? (
              <View>
                <SectionHeader title="Notes" />
                <ListGroup>
                  <View style={styles.notes}>
                    <Text selectable>{c.notes}</Text>
                  </View>
                </ListGroup>
              </View>
            ) : null}

            <Text variant="caption" tone="muted" style={styles.center}>
              Edit clients and contacts on the web.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  )
}

function Header({ client: c }: { client: ClientDetail }) {
  const kind = c.type === "company" ? "Company" : "Individual"
  return (
    <View style={styles.head}>
      <Avatar label={initialsOf(c.name)} size={56} round />
      <View style={styles.headText}>
        <Text variant="headline" accessibilityRole="header">
          {c.name}
        </Text>
        <View style={styles.badges}>
          <Text variant="callout" tone="muted">
            {kind}
          </Text>
          {c.status === "archived" ? <Badge label="Archived" /> : null}
        </View>
      </View>
    </View>
  )
}

/** Call and Email, for the client's own phone and email. */
function Reach({ client: c }: { client: ClientDetail }) {
  if (!c.phone && !c.email) return null
  return (
    <View style={styles.row}>
      {c.phone ? (
        <View style={styles.flex}>
          <Button
            title="Call"
            icon="call"
            variant="secondary"
            size="sm"
            accessibilityLabel={`Call ${c.name}`}
            onPress={() => open(tel(c.phone!))}
          />
        </View>
      ) : null}
      {c.email ? (
        <View style={styles.flex}>
          <Button
            title="Email"
            icon="mail"
            variant="secondary"
            size="sm"
            accessibilityLabel={`Email ${c.name}`}
            onPress={() => open(mailto(c.email!))}
          />
        </View>
      ) : null}
    </View>
  )
}

function Owed({
  unpaid,
  locale,
  name,
}: {
  unpaid: InvoiceSummary[]
  locale: string
  name: string
}) {
  const owed = totalsByCurrency(unpaid)
  const overdue = unpaid.filter((i) => i.displayStatus === "overdue").length
  if (owed.length === 0)
    return (
      <Text variant="callout" tone="muted">
        {`${name} doesn't owe you anything right now.`}
      </Text>
    )
  const amounts = owed
    .map((o) => formatMoney({ amount: o.amount, currency: o.currency }, locale))
    .join(" + ")
  const count = `${unpaid.length} unpaid invoice${unpaid.length === 1 ? "" : "s"}`
  return (
    <View
      style={styles.gap}
      accessible
      accessibilityLabel={`Owes you ${amounts}, ${count}${overdue ? `, ${overdue} overdue` : ""}`}
    >
      <Text variant="caption" tone="muted">
        Owes you
      </Text>
      <Text variant="display" numeric adjustsFontSizeToFit numberOfLines={1}>
        {amounts}
      </Text>
      <View style={styles.badges}>
        <Text variant="callout" tone="muted">
          {count}
        </Text>
        {overdue > 0 ? <Badge label={`${overdue} overdue`} tone="out" /> : null}
      </View>
    </View>
  )
}

function Contact({ contact: p }: { contact: ClientContact }) {
  const role = [p.title, p.isPrimary ? "Primary" : null]
    .filter(Boolean)
    .join(" · ")
  const sub = [role, p.email, p.phone].filter(Boolean).join("\n")
  return (
    <ListItem
      title={p.name}
      subtitle={sub || undefined}
      subtitleLines={3}
      leading={
        <Avatar label={initialsOf(p.name)} size={40} round tone="neutral" />
      }
      trailing={
        <View style={styles.row}>
          {p.phone ? (
            <IconButton
              icon="call"
              tone="primary"
              label={`Call ${p.name}, ${p.phone}`}
              onPress={() => open(tel(p.phone!))}
            />
          ) : null}
          {p.email ? (
            <IconButton
              icon="mail"
              tone="primary"
              label={`Email ${p.name}, ${p.email}`}
              onPress={() => open(mailto(p.email!))}
            />
          ) : null}
        </View>
      }
    />
  )
}

type Row = { label: string; value: string; url?: string; a11y?: string }

function Details({
  client: c,
  currency,
  terms,
}: {
  client: ClientDetail
  currency?: string
  terms?: number
}) {
  const address = [
    c.addressLine1,
    c.addressLine2,
    [c.city, c.state, c.postalCode].filter(Boolean).join(" "),
    c.country,
  ].filter(Boolean)
  const days = c.paymentTermsDays ?? terms
  const all: (Row | false | null | "")[] = [
    c.email && { label: "Email", value: c.email, url: mailto(c.email) },
    c.phone && { label: "Phone", value: c.phone, url: tel(c.phone) },
    c.website && { label: "Website", value: c.website, url: web(c.website) },
    address.length > 0 && {
      label: "Address",
      value: address.join("\n"),
      url: maps(address.join(", ")),
      a11y: `Address: ${address.join(", ")}. Opens Maps`,
    },
    c.taxId && { label: "Tax ID", value: c.taxId },
    {
      label: "Billing",
      value: [
        c.currency ?? currency ?? "Workspace currency",
        days != null ? `Net ${days} days` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ]
  const rows = all.filter((r): r is Row => Boolean(r))
  return (
    <ListGroup>
      {rows.map((r) => (
        <KeyValue
          key={r.label}
          label={r.label}
          value={
            r.url ? (
              <Link
                label={r.value}
                a11y={r.a11y ?? `${r.label}: ${r.value}`}
                url={r.url}
              />
            ) : (
              r.value
            )
          }
        />
      ))}
    </ListGroup>
  )
}

function Link({
  label,
  a11y,
  url,
}: {
  label: string
  a11y: string
  url: string
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={a11y}
      onPress={() => open(url)}
      hitSlop={6}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text variant="label" tone="primary" style={styles.right}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Space[4],
    gap: Space[4],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  gap: { gap: Space[1] },
  row: { flexDirection: "row", gap: Space[2] },
  head: { flexDirection: "row", alignItems: "center", gap: Space[3] },
  headText: { flex: 1, gap: Space[1] },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Space[2],
  },
  notes: { paddingHorizontal: Space[4] - 2, paddingVertical: Space[3] },
  link: { flexShrink: 1 },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
})
