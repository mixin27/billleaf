import {
  type ClientContact,
  type ClientDetail,
  formatMoney,
  type InvoiceSummary,
  type Permission,
} from "@workspace/contracts"
import { useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { InvoiceRow, totalsByCurrency } from "@/components/invoice-row"
import { Body, Button, Screen, Section } from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import { useClient } from "@/features/clients"
import { useDashboard } from "@/features/dashboard"
import { useClientInvoices } from "@/features/invoices"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"

/** Opens the phone, mail, maps or browser app; says so when there's none. */
async function open(url: string) {
  try {
    await Linking.openURL(url)
  } catch {
    Alert.alert("Couldn't open it", "No app on this phone can open that.")
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
 * One client: how to reach them, what they owe, and their invoices.
 * Adding and editing clients and contacts stays on the web.
 */
export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const me = useMe()
  const can = (p: Permission) => me.data?.permissions.includes(p) ?? false
  const client = useClient(id)
  const invoices = useClientInvoices(id, can("invoice.read"))
  const profile = useWorkspaceProfile().data
  const today = useDashboard().data?.today
  const locale =
    profile?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const [refreshing, setRefreshing] = React.useState(false)
  const c = client.data

  const rows = (items: InvoiceSummary[]) =>
    items.map((inv, i) => (
      <InvoiceRow
        key={inv.id}
        invoice={inv}
        locale={locale}
        today={today}
        first={i === 0}
        byNumber
      />
    ))

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await Promise.all([
                client.refetch(),
                can("invoice.read") ? invoices.refetch() : null,
              ])
              setRefreshing(false)
            }}
          />
        }
      >
        {client.error ? (
          <Body>{errorMessage(client.error)}</Body>
        ) : !c ? (
          <Body muted>Loading…</Body>
        ) : (
          <>
            <Header client={c} />
            <Reach client={c} />

            {!can("invoice.read") ? null : invoices.error ? (
              <Body>{errorMessage(invoices.error)}</Body>
            ) : !invoices.unpaid || !invoices.recent ? (
              <Body muted>Loading invoices…</Body>
            ) : (
              <>
                <Owed unpaid={invoices.unpaid} locale={locale} name={c.name} />
                {invoices.unpaid.length > 0 ? (
                  <Section title="Unpaid">{rows(invoices.unpaid)}</Section>
                ) : null}
                {invoices.recent.length > 0 ? (
                  <Section title="Recent invoices">
                    {rows(invoices.recent)}
                  </Section>
                ) : null}
              </>
            )}

            {c.contacts.length > 0 ? (
              <Section title="Contacts">
                {c.contacts.map((p, i) => (
                  <Contact key={p.id} contact={p} first={i === 0} />
                ))}
              </Section>
            ) : null}

            <Section title="Details">
              <Details
                client={c}
                currency={profile?.defaultCurrency}
                terms={profile?.paymentTermsDays}
              />
            </Section>

            {c.notes ? (
              <Section title="Notes">
                <Body style={styles.notes} selectable>
                  {c.notes}
                </Body>
              </Section>
            ) : null}

            <Body muted style={Type.small}>
              Edit clients and contacts on the web.
            </Body>
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function Header({ client: c }: { client: ClientDetail }) {
  const t = useTheme()
  const kind = c.type === "company" ? "Company" : "Individual"
  return (
    <View style={styles.gap}>
      <Text style={[Type.title, { color: t.text }]}>{c.name}</Text>
      <Text style={[Type.small, { color: t.textSecondary }]}>
        {c.status === "archived" ? `${kind} · Archived` : kind}
      </Text>
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
            variant="secondary"
            accessibilityLabel={`Call ${c.name}`}
            onPress={() => open(tel(c.phone!))}
          />
        </View>
      ) : null}
      {c.email ? (
        <View style={styles.flex}>
          <Button
            title="Email"
            variant="secondary"
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
  const t = useTheme()
  const owed = totalsByCurrency(unpaid)
  const overdue = unpaid.filter((i) => i.displayStatus === "overdue").length
  if (owed.length === 0)
    return <Body muted>{`${name} doesn't owe you anything right now.`}</Body>
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
      <Text style={[Type.small, { color: t.textSecondary }]}>Owes you</Text>
      <Text
        style={[styles.big, { color: t.text }]}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {amounts}
      </Text>
      <Text style={[Type.small, { color: t.textSecondary }]}>
        {count}
        {overdue > 0 ? (
          <Text style={{ color: t.danger, fontWeight: "600" }}>
            {` · ${overdue} overdue`}
          </Text>
        ) : null}
      </Text>
    </View>
  )
}

function Contact({
  contact: p,
  first,
}: {
  contact: ClientContact
  first: boolean
}) {
  const t = useTheme()
  const role = [p.title, p.isPrimary ? "Primary" : null]
    .filter(Boolean)
    .join(" · ")
  return (
    <View
      style={[
        styles.item,
        !first && { borderTopWidth: 1, borderTopColor: t.border },
      ]}
    >
      <Text style={[Type.body, { color: t.text }]}>{p.name}</Text>
      {role ? (
        <Text style={[Type.small, { color: t.textSecondary }]}>{role}</Text>
      ) : null}
      {p.email ? (
        <Link
          label={p.email}
          a11y={`Email ${p.name}, ${p.email}`}
          url={mailto(p.email)}
        />
      ) : null}
      {p.phone ? (
        <Link
          label={p.phone}
          a11y={`Call ${p.name}, ${p.phone}`}
          url={tel(p.phone)}
        />
      ) : null}
    </View>
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
  return rows.map((r, i) => <Detail key={r.label} {...r} first={i === 0} />)
}

function Detail({ label, value, url, a11y, first }: Row & { first: boolean }) {
  const t = useTheme()
  return (
    <View
      style={[
        styles.item,
        !first && { borderTopWidth: 1, borderTopColor: t.border },
      ]}
    >
      <Text style={[Type.small, { color: t.textSecondary }]}>{label}</Text>
      {url ? (
        <Link label={value} a11y={a11y ?? `${label}: ${value}`} url={url} />
      ) : (
        <Text style={[Type.body, { color: t.text }]} selectable>
          {value}
        </Text>
      )}
    </View>
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
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={a11y}
      onPress={() => open(url)}
      hitSlop={6}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={[Type.body, { color: t.primary }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  gap: { gap: Spacing.one },
  row: { flexDirection: "row", gap: Spacing.two },
  big: { fontSize: 34, fontWeight: "700", fontVariant: ["tabular-nums"] },
  item: { paddingVertical: Spacing.two + 2, gap: Spacing.half },
  notes: { paddingVertical: Spacing.two + 2 },
})
