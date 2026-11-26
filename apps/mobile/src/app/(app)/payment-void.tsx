import { formatMoney } from "@workspace/contracts"
import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { Alert, Platform, ScrollView, StyleSheet, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import {
  Body,
  Button,
  Field,
  KeyboardAvoid,
  Screen,
  Title,
} from "@/components/ui"
import { Spacing } from "@/constants/theme"
import { useInvoicePayments, useVoidPayment } from "@/features/invoices"
import { useWorkspaceProfile } from "@/features/workspaces"
import { errorMessage } from "@/lib/api"

/**
 * Void a payment recorded by mistake: the invoice balance goes back up and
 * the receipt is marked void. Refunds (money returned) are on the web.
 */
export default function VoidPaymentScreen() {
  const { invoiceId, paymentId } = useLocalSearchParams<{
    invoiceId: string
    paymentId: string
  }>()
  const payments = useInvoicePayments(invoiceId)
  const voiding = useVoidPayment(paymentId)
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const p = payments.data?.items.find((x) => x.id === paymentId)

  const [reason, setReason] = React.useState("")
  const [touched, setTouched] = React.useState(false)
  const reasonError =
    touched && reason.trim().length < 3 ? "Give a short reason" : undefined

  const submit = () => {
    setTouched(true)
    if (reason.trim().length < 3) return
    voiding.mutate(reason.trim(), {
      onSuccess: () => router.back(),
      onError: (e) => Alert.alert("Couldn't void the payment", errorMessage(e)),
    })
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
            <Title>Void payment</Title>
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
            {payments.error ? (
              <Body>{errorMessage(payments.error)}</Body>
            ) : !p ? (
              <Body muted>Loading…</Body>
            ) : (
              <>
                <Body muted>
                  {`For a payment recorded by mistake, e.g. the money never arrived or it went on the wrong invoice. ${formatMoney({ amount: p.amount, currency: p.currency }, locale)} comes off ${p.invoiceNumber ?? "the invoice"}, receipt ${p.receiptNumber ?? ""} is marked void, and it no longer counts as income.`}
                </Body>
                <Field
                  label="Reason"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="e.g. Recorded on the wrong invoice"
                  maxLength={500}
                  multiline
                  textAlignVertical="top"
                  style={styles.reason}
                  error={reasonError}
                />
                <Button
                  title="Void payment"
                  variant="danger"
                  loading={voiding.isPending}
                  onPress={submit}
                />
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
  reason: { minHeight: 90, paddingTop: Spacing.three },
})
