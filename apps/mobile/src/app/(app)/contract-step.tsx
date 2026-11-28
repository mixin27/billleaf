import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import {
  Button,
  confirm,
  DateField,
  ErrorState,
  KeyboardAvoid,
  SheetFooter,
  SheetHeader,
  Skeleton,
  Text,
  TextField,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import {
  useContract,
  useContractStep,
  useSignContract,
} from "@/features/contracts"
import { useDashboard } from "@/features/dashboard"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"

/**
 * Record a signature you got outside the client portal (who signed, and
 * when), or void a contract with an optional reason.
 */
export default function ContractStepScreen() {
  const { id, step } = useLocalSearchParams<{
    id: string
    step: "sign" | "void"
  }>()
  const isVoid = step === "void"
  const t = useTheme()
  const contract = useContract(id)
  const sign = useSignContract(id)
  const voiding = useContractStep(id)
  const today = useDashboard().data?.today
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const c = contract.data

  const [name, setName] = React.useState("")
  const [signedOn, setSignedOn] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState("")
  const [touched, setTouched] = React.useState(false)

  const date = signedOn ?? today ?? ""
  const dirty = isVoid
    ? reason.trim().length > 0
    : name.trim().length > 0 || signedOn !== null
  const nameError =
    touched && !name.trim() ? "Who signed for the client?" : undefined
  const dateError =
    touched && today && date > today ? "Can't be in the future" : undefined

  const close = async () => {
    if (
      dirty &&
      !(await confirm({
        title: isVoid ? "Discard the reason?" : "Discard this signature?",
        message: "What you've typed isn't saved.",
        confirmLabel: "Discard",
        destructive: true,
      }))
    )
      return
    router.back()
  }

  const submit = () => {
    setTouched(true)
    if (isVoid) {
      voiding.mutate(
        { step: "void", reason: reason.trim() || undefined },
        {
          onSuccess: () => {
            toast.success("Contract voided")
            router.back()
          },
          onError: (e) => toast.error(`Couldn't void it: ${errorMessage(e)}`),
        }
      )
      return
    }
    if (!name.trim() || !date || (today && date > today)) return
    sign.mutate(
      { signedByName: name.trim(), signedAt: date },
      {
        onSuccess: () => {
          toast.success("Signature recorded")
          router.back()
        },
        onError: (e) =>
          toast.error(`Couldn't record the signature: ${errorMessage(e)}`),
      }
    )
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader
        title={isVoid ? "Void contract" : "Record signature"}
        onClose={() => void close()}
      />
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {contract.error && !contract.data ? (
            <ErrorState
              compact
              error={contract.error}
              onRetry={() => void contract.refetch()}
            />
          ) : !c ? (
            <View style={styles.loading}>
              <Skeleton width="90%" height={14} />
              <Skeleton width="70%" height={14} />
              <Skeleton width="100%" height={48} />
            </View>
          ) : isVoid ? (
            <>
              <Text variant="body" tone="muted">
                {`${c.number ?? "The contract"} with ${c.clientName} stops being in force. It stays on record, marked void.`}
              </Text>
              <TextField
                label="Reason"
                value={reason}
                onChangeText={setReason}
                placeholder="Optional, e.g. replaced by a new contract"
                maxLength={500}
                multiline
                textAlignVertical="top"
                style={styles.reason}
              />
            </>
          ) : (
            <>
              <Text variant="body" tone="muted">
                {`For a signature you got outside the client portal, on paper or by email. ${c.number} becomes signed.`}
              </Text>
              <TextField
                label="Signed by"
                icon="user"
                value={name}
                onChangeText={setName}
                placeholder={`Who signed for ${c.clientName}`}
                autoCapitalize="words"
                autoComplete="name"
                maxLength={200}
                error={nameError}
              />
              {today ? (
                <View style={styles.gap}>
                  <DateField
                    label="Signed on"
                    value={date}
                    onChange={(d) => setSignedOn(d ?? today)}
                    today={today}
                    locale={locale}
                  />
                  {dateError ? (
                    <Text variant="caption" tone="out">
                      {dateError}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Skeleton width="100%" height={48} />
              )}
              <Text variant="callout" tone="muted">
                Clients who sign in the portal are recorded on their own, with a
                signature certificate on the PDF.
              </Text>
            </>
          )}
        </ScrollView>
        <SheetFooter>
          <Button
            title="Cancel"
            variant="secondary"
            onPress={() => void close()}
          />
          {isVoid ? (
            <Button
              title="Void contract"
              variant="danger"
              loading={voiding.isPending}
              disabled={!c}
              onPress={submit}
            />
          ) : (
            <Button
              title="Record signature"
              loading={sign.isPending}
              disabled={!c || !today}
              onPress={submit}
            />
          )}
        </SheetFooter>
      </KeyboardAvoid>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space[4], gap: Space[4], paddingBottom: Space[8] },
  gap: { gap: Space[1] },
  loading: { gap: Space[3] },
  reason: { minHeight: 90 },
})
