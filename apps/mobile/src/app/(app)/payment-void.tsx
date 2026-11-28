import { formatMoney } from "@workspace/contracts"
import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import {
  Button,
  confirm,
  ErrorState,
  KeyboardAvoid,
  SheetFooter,
  SheetHeader,
  SkeletonRows,
  Text,
  TextField,
  toast,
} from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { useInvoicePayments, useVoidPayment } from "@/features/invoices"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
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
  const t = useTheme()
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
      onSuccess: () => {
        toast.success("Payment voided")
        router.back()
      },
      onError: (e) =>
        toast.error(`Couldn't void the payment: ${errorMessage(e)}`),
    })
  }

  const close = async () => {
    if (
      reason.trim() &&
      !(await confirm({
        title: "Discard this?",
        message: "The payment stays as it is.",
        confirmLabel: "Discard",
        destructive: true,
      }))
    )
      return
    router.back()
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader title="Void payment" onClose={close} />
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {payments.error && !payments.data ? (
            <ErrorState
              error={payments.error}
              onRetry={() => void payments.refetch()}
            />
          ) : !p ? (
            <SkeletonRows rows={2} />
          ) : (
            <>
              <View
                style={[styles.notice, { backgroundColor: t.outSoft }]}
                accessible
              >
                <Text variant="callout" tone="out">
                  {`For a payment recorded by mistake, e.g. the money never arrived or it went on the wrong invoice. ${formatMoney({ amount: p.amount, currency: p.currency }, locale)} comes off ${p.invoiceNumber ?? "the invoice"}, receipt ${p.receiptNumber ?? ""} is marked void, and it no longer counts as income.`}
                </Text>
              </View>
              <TextField
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
            </>
          )}
        </ScrollView>
        {p ? (
          <SheetFooter>
            <Button
              title="Void payment"
              variant="danger"
              loading={voiding.isPending}
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
  notice: { borderRadius: Radius.lg, padding: Space[4] },
  reason: { minHeight: 90 },
})
