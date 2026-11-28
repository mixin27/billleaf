import { type Permission, sendDocumentSchema } from "@workspace/contracts"
import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import {
  Button,
  confirm,
  ErrorState,
  KeyboardAvoid,
  ListGroup,
  SheetFooter,
  SheetHeader,
  SkeletonRows,
  SwitchRow,
  Text,
  TextField,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import {
  defaultRecipient,
  useClient,
  useSetClientEmail,
} from "@/features/clients"
import { useContract, useEmailContract } from "@/features/contracts"
import {
  useInvoice,
  useInvoicePayments,
  useSendInvoice,
  useSendReceipt,
} from "@/features/invoices"
import { useMe } from "@/features/me"
import { useEmailQuote, useQuote } from "@/features/quotes"
import { useTheme } from "@/hooks/use-theme"
import { ApiError, errorMessage } from "@/lib/api"

const isEmail = (s: string) => sendDocumentSchema.shape.to.safeParse(s).success

/**
 * Email an invoice or a payment's receipt, PDF attached. "To" starts as
 * the address the API would pick (the client's primary contact); a client
 * with no address needs one typed here, and can keep it.
 */
export default function SendScreen() {
  const { kind, invoiceId, paymentId, quoteId, contractId } =
    useLocalSearchParams<{
      kind: "invoice" | "receipt" | "quote" | "contract"
      invoiceId?: string
      paymentId?: string
      quoteId?: string
      contractId?: string
    }>()
  const receipt = kind === "receipt"
  const isQuote = kind === "quote"
  const isContract = kind === "contract"
  const t = useTheme()
  const me = useMe()
  const can = (p: Permission) => me.data?.permissions.includes(p) ?? false
  const invoice = useInvoice(invoiceId ?? "")
  const quote = useQuote(isQuote ? (quoteId ?? "") : "")
  const contract = useContract(isContract ? (contractId ?? "") : "")
  /** The document being sent: its client and number. */
  const inv = isContract ? contract.data : isQuote ? quote.data : invoice.data
  const payments = useInvoicePayments(invoiceId ?? "", receipt)
  const payment = payments.data?.items.find((p) => p.id === paymentId)
  const client = useClient(inv?.clientId, can("client.read"))
  const sendInvoice = useSendInvoice(invoiceId ?? "")
  const sendReceipt = useSendReceipt(paymentId ?? "")
  const sendQuote = useEmailQuote(quoteId ?? "")
  const sendContract = useEmailContract(contractId ?? "")
  const send = isContract
    ? sendContract
    : isQuote
      ? sendQuote
      : receipt
        ? sendReceipt
        : sendInvoice
  const setEmail = useSetClientEmail(inv?.clientId ?? "")

  const fallback = client.data ? defaultRecipient(client.data) : undefined
  const [to, setTo] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState("")
  const [save, setSave] = React.useState(true)
  /** The API said there's no address to fall back on. */
  const [noRecipient, setNoRecipient] = React.useState(false)
  const [touched, setTouched] = React.useState(false)

  const text = (to ?? fallback ?? "").trim()
  // Known to have no address: you have to give one.
  const needsAddress = noRecipient || (client.data != null && !fallback)
  const toError = !text
    ? needsAddress && touched
      ? `${inv?.clientName ?? "This client"} has no email address. Enter one.`
      : undefined
    : !isEmail(text)
      ? "Enter a valid email address"
      : undefined
  const canSave = needsAddress && can("client.update") && isEmail(text)
  const number = receipt ? payment?.receiptNumber : inv?.number
  const lastSentTo = invoice.data && !receipt ? invoice.data.lastSentTo : null
  const loading = !inv || (receipt && !payment)
  const loadError =
    invoice.error ?? quote.error ?? contract.error ?? payments.error

  const submit = () => {
    setTouched(true)
    if (toError || (needsAddress && !text)) return
    send.mutate(
      { to: text || undefined, message: message.trim() || undefined },
      {
        onSuccess: async (res) => {
          const sentTo =
            text ||
            ("lastSentTo" in res ? res.lastSentTo : null) ||
            "the client"
          if (canSave && save) await setEmail.mutateAsync(text).catch(() => {})
          router.back()
          toast.success(`${number ?? "It"} was emailed to ${sentTo}.`)
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === "no_recipient") {
            setNoRecipient(true)
            setTouched(true)
          } else toast.error(`Couldn't send it: ${errorMessage(e)}`)
        },
      }
    )
  }

  const close = async () => {
    if (
      (to !== null || message.trim()) &&
      !(await confirm({
        title: "Discard this email?",
        message: "Nothing has been sent.",
        confirmLabel: "Discard",
        destructive: true,
      }))
    )
      return
    router.back()
  }

  const toHint =
    needsAddress && !text
      ? `${inv?.clientName ?? "This client"} has no email address yet. Enter one to send.`
      : !needsAddress && !can("client.read")
        ? "Leave blank to use the client's primary contact."
        : undefined

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader
        title={
          receipt
            ? "Email receipt"
            : isContract
              ? "Email contract"
              : isQuote
                ? "Email quote"
                : "Email invoice"
        }
        onClose={close}
      />
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {loadError && loading ? (
            <ErrorState
              error={loadError}
              onRetry={() => {
                if (invoice.error) void invoice.refetch()
                if (quote.error) void quote.refetch()
                if (contract.error) void contract.refetch()
                if (payments.error) void payments.refetch()
              }}
            />
          ) : loading || !inv ? (
            <SkeletonRows rows={2} />
          ) : (
            <>
              <Text variant="callout" tone="muted">
                {`${number} goes to ${inv.clientName} as a PDF, with a link to ${
                  isContract
                    ? "read and sign it"
                    : isQuote
                      ? "accept or decline it"
                      : receipt
                        ? "view it"
                        : "view and pay it"
                }. Replies go to your workspace email.`}
                {lastSentTo ? ` Last sent to ${lastSentTo}.` : ""}
              </Text>

              <TextField
                label="To"
                icon="mail"
                value={to ?? fallback ?? ""}
                onChangeText={(v) => {
                  setTo(v)
                  setNoRecipient(false)
                }}
                placeholder={
                  needsAddress ? "client@example.com" : "Client's billing email"
                }
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                error={touched ? toError : undefined}
                hint={toHint}
              />

              {canSave ? (
                <ListGroup>
                  <SwitchRow
                    title={`Save as ${inv.clientName}'s email`}
                    value={save}
                    onValueChange={setSave}
                  />
                </ListGroup>
              ) : null}

              <TextField
                label="Message"
                value={message}
                onChangeText={setMessage}
                placeholder="Optional, added to the email"
                multiline
                maxLength={2000}
                textAlignVertical="top"
                style={styles.message}
              />
            </>
          )}
        </ScrollView>
        {!loading && inv ? (
          <SheetFooter>
            <Button
              title={text && isEmail(text) ? `Send to ${text}` : "Send"}
              icon="mail"
              loading={send.isPending || setEmail.isPending}
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
  message: { minHeight: 110 },
})
