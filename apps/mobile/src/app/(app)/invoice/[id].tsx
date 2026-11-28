import {
  discountLabel,
  formatMoney,
  type Invoice,
  type InvoiceDisplayStatus,
  type Permission,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { LineItems, Total } from "@/components/line-items"
import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  Badge,
  type BadgeTone,
  BottomActionBar,
  Button,
  Card,
  ErrorState,
  Icon,
  IconButton,
  IconTile,
  ListGroup,
  ListItem,
  RefreshControl,
  SectionHeader,
  type SheetAction,
  showActions,
  Skeleton,
  SkeletonRows,
  Text,
  toast,
} from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
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
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { shortDate } from "@/lib/format"
import { queryClient } from "@/lib/query-client"

const STATUS_TONE: Record<InvoiceDisplayStatus, BadgeTone> = {
  draft: "neutral",
  open: "info",
  overdue: "out",
  partially_paid: "warning",
  paid: "in",
  void: "neutral",
}

/**
 * One invoice: what's due, its lines and payments. From here you record a
 * payment, share the PDF, or email the invoice or a receipt to the client. Drafts are edited and
 * issued on the web.
 */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
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

  const canRecord =
    !!inv &&
    inv.status === "issued" &&
    inv.amountDue > 0 &&
    can("payment.record")
  const canEmail = !!inv && inv.status === "issued" && can("invoice.send")

  const share = async () => {
    if (!inv) return
    setSharing(true)
    try {
      await shareInvoicePdf(inv)
    } catch (e) {
      toast.error(`Couldn't get the PDF: ${errorMessage(e)}`)
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

  const recordPayment = () =>
    router.push({ pathname: "/payment-new", params: { invoiceId: id } })

  const more = () => {
    const actions: SheetAction[] = [
      { label: "Share PDF", icon: "share", onPress: () => void share() },
    ]
    if (canEmail)
      actions.push({
        label: "Email client",
        icon: "mail",
        onPress: () => email(),
      })
    showActions(actions, inv?.number ?? "Draft invoice")
  }

  const paymentItems = can("payment.read") ? (payments.data?.items ?? []) : []
  const creditNotes = inv?.creditNotes ?? []

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <Stack.Screen
        options={{
          title: inv ? (inv.number ?? "Draft invoice") : "Invoice",
          headerRight: inv
            ? () => (
                <IconButton
                  icon="more"
                  label="More actions"
                  disabled={sharing}
                  onPress={more}
                />
              )
            : undefined,
        }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[8] + (inv ? 0 : playerInset) },
        ]}
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
            error={invoice.error}
            onRetry={() => void invoice.refetch()}
          />
        ) : !inv ? (
          <>
            <Card>
              <Skeleton width="50%" height={18} />
              <Skeleton width="70%" height={32} />
              <Skeleton width="40%" height={12} />
            </Card>
            <SkeletonRows rows={3} />
          </>
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
                accessible
                style={[styles.notice, { backgroundColor: t.warningSoft }]}
              >
                <Icon name="alert" size={20} tone="warning" />
                <View style={styles.flex}>
                  <Text variant="bodyStrong" tone="warning">
                    Your client won't see how to pay this invoice
                  </Text>
                  <Text variant="callout" tone="warning">
                    {`None of your payment methods accept ${inv.currency}, so the PDF, the email and the client portal show no payment details. Add one for ${inv.currency} in Settings → Payment methods on the web.`}
                  </Text>
                </View>
              </View>
            ) : null}

            <View>
              <SectionHeader title="Items" />
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
            </View>

            {creditNotes.length ? (
              <View>
                <SectionHeader title="Credit notes" />
                <ListGroup>
                  {creditNotes.map((c) => (
                    <ListItem
                      key={c.id}
                      leading={<IconTile icon="receipt" />}
                      title={c.number}
                      subtitle={[
                        `Issued ${date(c.issueDate)}`,
                        c.appliedAmount
                          ? `${money(c.appliedAmount)} applied`
                          : null,
                        c.refundAmount
                          ? `${money(c.refundAmount)} refunded`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      subtitleLines={2}
                      trailing={
                        <>
                          <Text
                            variant="bodyStrong"
                            numeric
                            style={
                              c.status === "void" ? styles.struck : undefined
                            }
                          >
                            {money(c.total)}
                          </Text>
                          {c.status === "void" ? <Badge label="Void" /> : null}
                        </>
                      }
                    />
                  ))}
                </ListGroup>
              </View>
            ) : null}

            {can("payment.read") &&
            (paymentItems.length ||
              (payments.isPending && !payments.data) ||
              (payments.error && !payments.data)) ? (
              <View>
                <SectionHeader title="Payments" />
                {payments.error && !payments.data ? (
                  <ErrorState
                    compact
                    error={payments.error}
                    onRetry={() => void payments.refetch()}
                  />
                ) : !payments.data ? (
                  <SkeletonRows rows={2} />
                ) : (
                  <ListGroup>
                    {paymentItems.map((p) => {
                      const completed = p.status === "completed"
                      const sendable =
                        p.receiptId && completed && can("payment.record")
                      const voidable = completed && can("payment.refund")
                      const actions: SheetAction[] = []
                      if (sendable)
                        actions.push({
                          label: p.receiptLastSentAt
                            ? "Send receipt again"
                            : "Send receipt",
                          icon: "mail",
                          onPress: () => email(p.id),
                        })
                      if (voidable)
                        actions.push({
                          label: "Void (recorded by mistake)",
                          icon: "close",
                          destructive: true,
                          onPress: () =>
                            router.push({
                              pathname: "/payment-void",
                              params: { invoiceId: id, paymentId: p.id },
                            }),
                        })
                      const title = `${date(p.paidOn)} · ${PAYMENT_METHOD_LABELS[p.method]}`
                      const subtitle = [
                        p.receiptNumber && `Receipt ${p.receiptNumber}`,
                        p.reference,
                        !completed && PAYMENT_STATUS_LABELS[p.status],
                        p.voidReason,
                        p.receiptLastSentAt &&
                          completed &&
                          `Sent ${date(p.receiptLastSentAt.slice(0, 10))}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                      return (
                        <ListItem
                          key={p.id}
                          leading={
                            <IconTile
                              icon="payment"
                              tone={completed ? "in" : "neutral"}
                            />
                          }
                          title={title}
                          subtitle={subtitle || undefined}
                          subtitleLines={3}
                          accessibilityLabel={`${title}, ${money(p.amount)}${subtitle ? `, ${subtitle}` : ""}`}
                          accessibilityHint={
                            actions.length
                              ? voidable
                                ? "Send the receipt, or void a payment recorded by mistake"
                                : "Send the receipt"
                              : undefined
                          }
                          onPress={
                            actions.length
                              ? () =>
                                  showActions(
                                    actions,
                                    `${money(p.amount)} · ${title}`
                                  )
                              : undefined
                          }
                          trailing={
                            <Text
                              variant="bodyStrong"
                              numeric
                              tone={completed ? "default" : "muted"}
                              style={completed ? undefined : styles.struck}
                            >
                              {money(p.amount)}
                            </Text>
                          }
                          chevron={actions.length > 0}
                        />
                      )
                    })}
                  </ListGroup>
                )}
              </View>
            ) : null}

            {inv.notes ? (
              <View>
                <SectionHeader title="Notes" />
                <Card>
                  <Text variant="body" selectable>
                    {inv.notes}
                  </Text>
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      {inv ? (
        <BottomActionBar>
          {canRecord ? (
            <Button
              title="Record payment"
              icon="payment"
              onPress={recordPayment}
            />
          ) : (
            <>
              <Button
                title="Share PDF"
                icon="share"
                variant="secondary"
                loading={sharing}
                onPress={share}
              />
              {canEmail ? (
                <Button
                  title="Email client"
                  icon="mail"
                  variant="secondary"
                  onPress={() => email()}
                />
              ) : null}
            </>
          )}
        </BottomActionBar>
      ) : null}
    </View>
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
  const owing = inv.status === "issued" && inv.amountDue > 0
  const status = INVOICE_STATUS_LABELS[inv.displayStatus]
  const dates = [
    inv.status === "draft" ? "Not issued" : `Issued ${date(inv.issueDate)}`,
    inv.dueDate && inv.status !== "void" ? `Due ${date(inv.dueDate)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="caption" tone="muted">
            {inv.number ?? "Draft invoice"}
          </Text>
          {canOpenClient ? (
            <Text
              variant="headline"
              tone="primary"
              accessibilityRole="link"
              accessibilityHint="Opens the client"
              onPress={() =>
                router.push({
                  pathname: "/client/[id]",
                  params: { id: inv.clientId },
                })
              }
            >
              {inv.clientName}
            </Text>
          ) : (
            <Text variant="headline">{inv.clientName}</Text>
          )}
          {inv.title ? (
            <Text variant="callout" tone="muted">
              {inv.title}
            </Text>
          ) : null}
        </View>
        <Badge label={status} tone={STATUS_TONE[inv.displayStatus]} />
      </View>

      <View>
        <Text variant="caption" tone="muted">
          {owing ? "Amount due" : "Total"}
        </Text>
        <Text
          variant="display"
          numeric
          tone={inv.displayStatus === "overdue" ? "out" : "default"}
          accessibilityLabel={`${owing ? "Due" : "Total"} ${money(owing ? inv.amountDue : inv.total)}`}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {money(owing ? inv.amountDue : inv.total)}
        </Text>
        {owing && inv.amountDue !== inv.total ? (
          <Text variant="callout" tone="muted">
            {`${money(inv.amountDue)} of ${money(inv.total)} due`}
          </Text>
        ) : null}
      </View>

      {dates ? (
        <View style={styles.meta}>
          <Icon name="calendar" size={16} tone="muted" />
          <Text variant="callout" tone="muted" style={styles.flex}>
            {dates}
          </Text>
        </View>
      ) : null}
      {inv.status === "void" && inv.voidReason ? (
        <Text variant="callout" tone="muted">
          Voided: {inv.voidReason}
        </Text>
      ) : null}
      {inv.status === "draft" ? (
        <Text variant="callout" tone="muted">
          Edit and issue drafts on the web.
        </Text>
      ) : null}
    </Card>
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
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Space[2],
  },
  meta: { flexDirection: "row", alignItems: "center", gap: Space[2] },
  notice: {
    flexDirection: "row",
    gap: Space[3],
    borderRadius: Radius.lg,
    padding: Space[4],
  },
  right: { flexShrink: 1, textAlign: "right" },
  struck: { textDecorationLine: "line-through" },
})
