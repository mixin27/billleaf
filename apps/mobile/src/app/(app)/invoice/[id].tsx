import {
  discountLabel,
  formatMoney,
  type Invoice,
  type Permission,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { LineItems, Total } from "@/components/line-items"
import {
  Body,
  Button,
  Screen,
  Section,
  ErrorState,
  RefreshControl,
} from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import {
  INVOICE_STATUS_LABELS,
  shareInvoicePdf,
  useInvoice,
  useInvoicePayments,
} from "@/features/invoices"
import { useMe } from "@/features/me"
import { useHasPaymentMethodFor } from "@/features/payment-accounts"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
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
  // Clients only see payment methods that take the invoice's currency.
  const canPay = useHasPaymentMethodFor(inv?.currency)
  const noWayToPay =
    canPay === false &&
    !!inv &&
    (inv.status === "draft" || (inv.status === "issued" && inv.amountDue > 0))
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
                // You may have just added a payment method on the web.
                queryClient.invalidateQueries({
                  queryKey: ["payment-accounts"],
                }),
              ])
              setRefreshing(false)
            }}
          />
        }
      >
        {invoice.error && !invoice.data ? (
          <ErrorState
            compact
            error={invoice.error}
            onRetry={() => void invoice.refetch()}
          />
        ) : !inv ? (
          <Body muted>Loading…</Body>
        ) : (
          <>
            <Summary
              invoice={inv}
              money={money}
              date={date}
              canOpenClient={can("client.read")}
            />

            {noWayToPay ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.notice,
                  { backgroundColor: t.warningBackground },
                ]}
              >
                <Text style={[Type.body, styles.bold, { color: t.warning }]}>
                  Your client won't see how to pay this invoice
                </Text>
                <Text style={[Type.small, { color: t.warning }]}>
                  {`None of your payment methods accept ${inv.currency}, so the PDF, the email and the client portal show no payment details. Add one for ${inv.currency} in Settings → Payment methods on the web.`}
                </Text>
              </View>
            ) : null}

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
              <LineItems lines={inv.lines} money={money}>
                <Total label="Subtotal" value={money(inv.subtotal)} />
                {inv.discountTotal ? (
                  <Total
                    label={
                      inv.discount?.type === "percent"
                        ? `Discount (${discountLabel(inv.discount)})`
                        : "Discount"
                    }
                    value={`−${money(inv.discountTotal)}`}
                  />
                ) : null}
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
              </LineItems>
            </Section>

            {can("payment.read") && payments.data?.items.length ? (
              <Section title="Payments">
                {payments.data.items.map((p, i) => {
                  const completed = p.status === "completed"
                  const sendable =
                    p.receiptId && completed && can("payment.record")
                  const voidable = completed && can("payment.refund")
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
                              !completed && PAYMENT_STATUS_LABELS[p.status],
                              p.voidReason,
                              p.receiptLastSentAt &&
                                completed &&
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
                              textDecorationLine: completed
                                ? "none"
                                : "line-through",
                            },
                          ]}
                        >
                          {money(p.amount)}
                        </Text>
                      </View>
                      {sendable || voidable ? (
                        <View style={styles.paymentAction}>
                          {sendable ? (
                            <Button
                              title={
                                p.receiptLastSentAt
                                  ? "Send receipt again"
                                  : "Send receipt"
                              }
                              variant="link"
                              onPress={() => email(p.id)}
                            />
                          ) : null}
                          {voidable ? (
                            <Button
                              title="Void"
                              variant="link"
                              accessibilityHint="For a payment recorded by mistake"
                              onPress={() =>
                                router.push({
                                  pathname: "/payment-void",
                                  params: { invoiceId: id, paymentId: p.id },
                                })
                              }
                            />
                          ) : null}
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
  canOpenClient,
}: {
  invoice: Invoice
  money: (n: number) => string
  date: (iso: string) => string
  canOpenClient: boolean
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
      {canOpenClient ? (
        <Pressable
          accessibilityRole="link"
          accessibilityHint="Opens the client"
          onPress={() =>
            router.push({
              pathname: "/client/[id]",
              params: { id: inv.clientId },
            })
          }
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={[Type.heading, { color: t.primary }]}>
            {inv.clientName}
          </Text>
        </Pressable>
      ) : (
        <Text style={[Type.heading, { color: t.text }]}>{inv.clientName}</Text>
      )}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  summary: { gap: Spacing.one },
  notice: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.one },
  big: { fontSize: 34, fontWeight: "700", fontVariant: ["tabular-nums"] },
  actions: { gap: Spacing.two },
  row: { flexDirection: "row", gap: Spacing.two },
  bold: { fontWeight: "700" },
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
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: -Spacing.one,
    marginLeft: -Spacing.three,
  },
})
