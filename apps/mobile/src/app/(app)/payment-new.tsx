import {
  addDays,
  formatMoney,
  fromMinorUnits,
  PAYMENT_METHOD_LABELS,
  paymentMethodSchema,
  type PaymentMethod,
  toMinorUnits,
} from "@workspace/contracts"
import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import {
  Body,
  Button,
  Chip,
  Field,
  KeyboardAvoid,
  Screen,
  Title,
} from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import { useInvoice, useRecordPayment } from "@/features/invoices"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { normalizeAmount } from "@/lib/amount"
import { errorMessage } from "@/lib/api"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

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
  const dateError =
    touched && !ISO_DATE.test(date) ? "Use YYYY-MM-DD" : undefined
  const valid =
    minor !== null && minor >= 1 && minor <= due && ISO_DATE.test(date)

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
        onSuccess: () => router.back(),
        onError: (e) =>
          Alert.alert("Couldn't record the payment", errorMessage(e)),
      }
    )
  }

  return (
    <Screen>
      {/* An iOS sheet leaves room at the top; Android shows it full screen. */}
      <SafeAreaView
        style={styles.flex}
        edges={Platform.OS === "android" ? ["top", "bottom"] : ["bottom"]}
      >
        <KeyboardAvoid>
          <View style={styles.header}>
            <Title>Record payment</Title>
            <Button
              title="Cancel"
              variant="link"
              onPress={() => router.back()}
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {invoice.error ? (
              <Body>{errorMessage(invoice.error)}</Body>
            ) : !inv ? (
              <Body muted>Loading…</Body>
            ) : (
              <>
                <Body muted>
                  {`${inv.number} · ${inv.clientName} · ${formatMoney({ amount: due, currency }, locale)} due`}
                </Body>

                <Field
                  label={`Amount received (${currency})`}
                  value={text}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  error={amountError}
                />

                <View style={styles.gap}>
                  <Field
                    label="Paid on"
                    value={date}
                    onChangeText={setPaidOn}
                    keyboardType="numbers-and-punctuation"
                    autoCorrect={false}
                    maxLength={10}
                    error={dateError}
                  />
                  {today ? (
                    <View style={styles.wrap}>
                      {[
                        ["Today", today],
                        ["Yesterday", addDays(today, -1)],
                      ].map(([label, value]) => (
                        <Chip
                          key={label}
                          label={label!}
                          selected={date === value}
                          onPress={() => setPaidOn(value!)}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.gap}>
                  <Text style={[Type.small, styles.label, { color: t.text }]}>
                    Method
                  </Text>
                  <View style={styles.wrap}>
                    {paymentMethodSchema.options.map((m) => (
                      <Chip
                        key={m}
                        label={PAYMENT_METHOD_LABELS[m]}
                        selected={method === m}
                        onPress={() => setMethod(m)}
                      />
                    ))}
                  </View>
                </View>

                <Field
                  label="Reference"
                  value={reference}
                  onChangeText={setReference}
                  placeholder="Optional, e.g. a transfer ID"
                  autoCorrect={false}
                  maxLength={200}
                />

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
                <Body muted style={Type.small}>
                  A receipt is created for the payment. Send it to the client
                  from the web.
                </Body>
              </>
            )}
          </ScrollView>
        </KeyboardAvoid>
      </SafeAreaView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  content: { padding: Spacing.four, gap: Spacing.four },
  gap: { gap: Spacing.two },
  label: { fontWeight: "600" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
})
