import {
  displayDigits,
  formatMoney,
  fromMinorUnits,
  PAYMENT_METHOD_LABELS,
  paymentMethodSchema,
  type PaymentMethod,
  toMinorUnits,
} from "@workspace/contracts"
import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import {
  Button,
  Chip,
  confirm,
  DateField,
  ErrorState,
  KeyboardAvoid,
  MoneyInput,
  SheetFooter,
  SheetHeader,
  Skeleton,
  Text,
  TextField,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import { useInvoice, useRecordPayment } from "@/features/invoices"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { normalizeAmount } from "@/lib/amount"
import { errorMessage } from "@/lib/api"

/**
 * Record money received against an issued invoice: the balance by default,
 * or part of it. The API issues the receipt (RCT-…).
 */
export default function RecordPaymentScreen() {
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>()
  const t = useTheme()
  const invoice = useInvoice(invoiceId)
  const record = useRecordPayment(invoiceId)
  const today = useDashboard().data?.today
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale

  const inv = invoice.data
  const currency = inv?.currency ?? "USD"
  const [amount, setAmount] = React.useState<string | null>(null)
  const [paidOn, setPaidOn] = React.useState<string | null>(null)
  const [method, setMethod] = React.useState<PaymentMethod>("bank_transfer")
  const [reference, setReference] = React.useState("")
  const [touched, setTouched] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setDirty(true)
      set(v)
    }

  // The balance until you type something else.
  const text = amount ?? (inv ? fromMinorUnits(inv.amountDue, currency) : "")
  const date = paidOn ?? today ?? ""
  const minor = text.trim()
    ? toMinorUnits(normalizeAmount(text), currency)
    : null
  const due = inv?.amountDue ?? 0
  const amountError =
    minor === null || minor < 1
      ? touched
        ? "Enter the amount received"
        : undefined
      : minor > due
        ? `More than the ${formatMoney({ amount: due, currency }, locale)} due`
        : undefined
  const valid = minor !== null && minor >= 1 && minor <= due && Boolean(date)

  const submit = () => {
    setTouched(true)
    if (!valid) return
    record.mutate(
      {
        amount: minor!,
        paidOn: date,
        method,
        reference: reference || null,
      },
      {
        onSuccess: (payment) => {
          router.back()
          if (!payment.receiptNumber) {
            toast.success("Payment recorded")
            return
          }
          toast.success(
            `Payment recorded. Receipt ${payment.receiptNumber} is ready.`,
            {
              label: "Send receipt",
              onPress: () =>
                router.push({
                  pathname: "/send",
                  params: {
                    kind: "receipt",
                    invoiceId,
                    paymentId: payment.id,
                  },
                }),
            }
          )
        },
        onError: (e) =>
          toast.error(`Couldn't record the payment: ${errorMessage(e)}`),
      }
    )
  }

  const close = async () => {
    if (
      dirty &&
      !(await confirm({
        title: "Discard this payment?",
        message: "What you've entered isn't saved.",
        confirmLabel: "Discard",
        destructive: true,
      }))
    )
      return
    router.back()
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader title="Record payment" onClose={close} />
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {invoice.error && !invoice.data ? (
            <ErrorState
              error={invoice.error}
              onRetry={() => void invoice.refetch()}
            />
          ) : !inv ? (
            <View style={styles.group}>
              <Skeleton width="70%" height={14} />
              <Skeleton width="100%" height={60} />
              <Skeleton width="50%" height={36} />
            </View>
          ) : (
            <>
              <Text variant="callout" tone="muted">
                {`${inv.number} · ${inv.clientName} · ${formatMoney({ amount: due, currency }, locale)} due`}
              </Text>

              <View style={styles.group}>
                <Text variant="label" tone="muted">
                  {`Amount received (${currency})`}
                </Text>
                <MoneyInput
                  value={text}
                  onChangeText={change(setAmount)}
                  currency={currency}
                  tone="in"
                  decimals={displayDigits(currency) > 0}
                  error={amountError}
                />
              </View>

              {today ? (
                <DateField
                  label="Paid on"
                  value={date}
                  onChange={(d) => change(setPaidOn)(d ?? today)}
                  today={today}
                  locale={locale}
                />
              ) : null}

              <View style={styles.group}>
                <Text variant="label" tone="muted">
                  Method
                </Text>
                <View style={styles.wrap}>
                  {paymentMethodSchema.options.map((m) => (
                    <Chip
                      key={m}
                      label={PAYMENT_METHOD_LABELS[m]}
                      selected={method === m}
                      onPress={() => change(setMethod)(m)}
                    />
                  ))}
                </View>
              </View>

              <TextField
                label="Reference"
                value={reference}
                onChangeText={change(setReference)}
                placeholder="Optional, e.g. a transfer ID"
                autoCorrect={false}
                maxLength={200}
              />

              <Text variant="caption" tone="muted">
                A receipt is created for the payment. You can email it to the
                client next.
              </Text>
            </>
          )}
        </ScrollView>
        {inv ? (
          <SheetFooter>
            <Button
              title={
                minor && minor >= 1 && minor <= due
                  ? `Record ${formatMoney({ amount: minor, currency }, locale)}`
                  : "Record payment"
              }
              loading={record.isPending}
              disabled={!today}
              onPress={submit}
            />
          </SheetFooter>
        ) : null}
      </KeyboardAvoid>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space[4], gap: Space[4], paddingBottom: Space[8] },
  group: { gap: Space[2] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Space[2] },
})
