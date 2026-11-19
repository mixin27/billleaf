import {
  formatMoney,
  type Invoice,
  type Permission,
  PAYMENT_METHOD_LABELS,
} from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { Body, Button, Screen } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import {
  INVOICE_STATUS_LABELS,
  shareInvoicePdf,
  useInvoice,
  useInvoicePayments,
} from "@/features/invoices"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { shortDate } from "@/lib/format"

/**
 * One invoice: what's due, its lines and payments. From here you record a
 * payment, share the PDF, or email the invoice or a receipt to the client. Drafts are edited and
 * issued on the web.
 */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const me = useMe()
  const can = (p: Permission) => me.data?.permissions.includes(p) ?? false
  const invoice = useInvoice(id)
  const payments = useInvoicePayments(id, can("payment.read"))
  const today = useDashboard().data?.today
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const [sharing, setSharing] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)

  const inv = invoice.data
  const money = (amount: number) =>
    formatMoney({ amount, currency: inv?.currency ?? "USD" }, locale)
  const date = (iso: string) => shortDate(iso, locale, today)

  const share = async () => {
    if (!inv) return
    setSharing(true)
    try {
      await shareInvoicePdf(inv)
    } catch (e) {
      Alert.alert("Couldn't get the PDF", errorMessage(e))
    } finally {
      setSharing(false)
    }
  }

  const email = (paymentId?: string) =>
    router.push({
      pathname: "/send",
      params: paymentId
        ? { kind: "receipt", invoiceId: id, paymentId }
        : { kind: "invoice", invoiceId: id },
    })

  return (
    <Screen>
      <Stack.Screen options={{ title: inv?.number ?? "Draft invoice" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await Promise.all([
                invoice.refetch(),
                can("payment.read") ? payments.refetch() : null,
              ])
              setRefreshing(false)
            }}
          />
        }
      >
        {invoice.error ? (
          <Body>{errorMessage(invoice.error)}</Body>
        ) : !inv ? (
          <Body muted>Loading…</Body>
        ) : (
          <>
            <Summary invoice={inv} money={money} date={date} />

            <View style={styles.actions}>
              {inv.status === "issued" &&
              inv.amountDue > 0 &&
              can("payment.record") ? (
                <Button
                  title="Record payment"
                  onPress={() =>
                    router.push({
                      pathname: "/payment-new",
                      params: { invoiceId: inv.id },
                    })
                  }
                />
              ) : null}
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Button
                    title="Share PDF"
                    variant="secondary"
                    loading={sharing}
                    onPress={share}
                  />
                </View>
                {inv.status === "issued" && can("invoice.send") ? (
                  <View style={styles.flex}>
                    <Button
                      title="Email client"
                      variant="secondary"
                      onPress={() => email()}
                    />
                  </View>
                ) : null}
              </View>
              {inv.status === "draft" ? (
                <Body muted style={Type.small}>
                  Edit and issue drafts on the web.
                </Body>
              ) : null}
            </View>

            <Section title="Items">
              {inv.lines.length === 0 ? (
                <Body muted>No items.</Body>
              ) : (
                inv.lines.map((l, i) => (
                  <View
                    key={l.id}
                    style={[
                      styles.line,
                      i > 0 && { borderTopWidth: 1, borderTopColor: t.border },
                    ]}
                  >
                    <View style={styles.flex}>
                      <Text style={[Type.body, { color: t.text }]}>
                        {l.description}
                      </Text>
                      <Text style={[Type.small, { color: t.textSecondary }]}>
                        {`${l.quantity} × ${money(l.unitPrice)}`}
                        {l.taxRateBps ? ` · tax ${l.taxRateBps / 100}%` : ""}
                      </Text>
                    </View>
                    <Text style={[Type.body, styles.num, { color: t.text }]}>
                      {money(l.amount)}
                    </Text>
                  </View>
                ))
              )}
              <View style={[styles.totals, { borderTopColor: t.border }]}>
                <Total label="Subtotal" value={money(inv.subtotal)} />
                {inv.taxTotal ? (
                  <Total label="Tax" value={money(inv.taxTotal)} />
                ) : null}
                <Total label="Total" value={money(inv.total)} bold />
                {inv.amountPaid ? (
                  <Total label="Paid" value={`−${money(inv.amountPaid)}`} />
                ) : null}
                {inv.amountCredited ? (
                  <Total
                    label="Credited"
                    value={`−${money(inv.amountCredited)}`}
                  />
                ) : null}
                {inv.status === "issued" ? (
                  <Total label="Due" value={money(inv.amountDue)} bold />
                ) : null}
              </View>
            </Section>

            {can("payment.read") && payments.data?.items.length ? (
              <Section title="Payments">
                {payments.data.items.map((p, i) => {
                  const sendable =
                    p.receiptId &&
                    p.status !== "refunded" &&
                    can("payment.record")
                  return (
                    <View
                      key={p.id}
                      style={[
                        styles.payment,
                        i > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: t.border,
                        },
                      ]}
                    >
                      <View style={styles.line} accessible>
                        <View style={styles.flex}>
                          <Text style={[Type.body, { color: t.text }]}>
                            {`${date(p.paidOn)} · ${PAYMENT_METHOD_LABELS[p.method]}`}
                          </Text>
                          <Text
                            style={[Type.small, { color: t.textSecondary }]}
                          >
                            {[
                              p.receiptNumber && `Receipt ${p.receiptNumber}`,
                              p.reference,
                              p.status === "refunded" && "Refunded",
                              p.receiptLastSentAt &&
                                p.status !== "refunded" &&
                                `Sent ${date(p.receiptLastSentAt.slice(0, 10))}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        </View>
                        <Text
                          style={[
                            Type.body,
                            styles.num,
                            {
                              color: t.text,
                              textDecorationLine:
                                p.status === "refunded"
                                  ? "line-through"
                                  : "none",
                            },
                          ]}
                        >
                          {money(p.amount)}
                        </Text>
                      </View>
                      {sendable ? (
                        <View style={styles.paymentAction}>
                          <Button
                            title={
                              p.receiptLastSentAt
                                ? "Send receipt again"
                                : "Send receipt"
                            }
                            variant="link"
                            onPress={() => email(p.id)}
                          />
                        </View>
                      ) : null}
                    </View>
                  )
                })}
              </Section>
            ) : null}

            {inv.notes ? (
              <Section title="Notes">
                <Body>{inv.notes}</Body>
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function Summary({
  invoice: inv,
  money,
  date,
}: {
  invoice: Invoice
  money: (n: number) => string
  date: (iso: string) => string
}) {
  const t = useTheme()
  const owing = inv.status === "issued" && inv.amountDue > 0
  const status = INVOICE_STATUS_LABELS[inv.displayStatus]
  const dates = [
    inv.status === "draft" ? "Not issued" : `Issued ${date(inv.issueDate)}`,
    inv.dueDate && inv.status !== "void" ? `Due ${date(inv.dueDate)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <View style={styles.summary}>
      <Text style={[Type.heading, { color: t.text }]}>{inv.clientName}</Text>
      {inv.title ? (
        <Text style={[Type.body, { color: t.textSecondary }]}>{inv.title}</Text>
      ) : null}
      <Text
        style={[styles.big, { color: t.text }]}
        accessibilityLabel={`${owing ? "Due" : "Total"} ${money(owing ? inv.amountDue : inv.total)}`}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {money(owing ? inv.amountDue : inv.total)}
      </Text>
      <Text style={[Type.small, { color: t.textSecondary }]}>
        <Text
          style={{
            color:
              inv.displayStatus === "overdue"
                ? t.danger
                : inv.displayStatus === "paid"
                  ? t.primary
                  : t.text,
            fontWeight: "600",
          }}
        >
          {status}
        </Text>
        {owing && inv.amountDue !== inv.total
          ? ` · ${money(inv.amountDue)} of ${money(inv.total)} due`
          : ""}
        {dates ? ` · ${dates}` : ""}
      </Text>
      {inv.status === "void" && inv.voidReason ? (
        <Body muted style={Type.small}>
          Voided: {inv.voidReason}
        </Body>
      ) : null}
    </View>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View style={styles.gap}>
      <Text
        accessibilityRole="header"
        style={[Type.small, styles.heading, { color: t.textSecondary }]}
      >
        {title.toUpperCase()}
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: t.backgroundElement, borderColor: t.border },
        ]}
      >
        {children}
      </View>
    </View>
  )
}

function Total({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  const t = useTheme()
  const weight = bold ? styles.bold : null
  return (
    <View style={styles.total} accessible>
      <Text style={[Type.body, weight, { color: t.textSecondary }]}>
        {label}
      </Text>
      <Text style={[Type.body, styles.num, weight, { color: t.text }]}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  summary: { gap: Spacing.one },
  big: { fontSize: 34, fontWeight: "700", fontVariant: ["tabular-nums"] },
  actions: { gap: Spacing.two },
  row: { flexDirection: "row", gap: Spacing.two },
  gap: { gap: Spacing.two },
  heading: { fontWeight: "600" },
  bold: { fontWeight: "700" },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  line: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  num: { fontVariant: ["tabular-nums"] },
  payment: { paddingBottom: Spacing.one },
  // Line the link text up with the row (the button pads its sides).
  paymentAction: {
    alignItems: "flex-start",
    marginTop: -Spacing.one,
    marginLeft: -Spacing.three,
  },
  totals: {
    borderTopWidth: 1,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  total: { flexDirection: "row", justifyContent: "space-between" },
})
