import { addDays } from "@workspace/contracts"
import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { Alert, Platform, ScrollView, StyleSheet, View } from "react-native"
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
import {
  useContract,
  useContractStep,
  useSignContract,
} from "@/features/contracts"
import { useDashboard } from "@/features/dashboard"
import { errorMessage } from "@/lib/api"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

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
  const contract = useContract(id)
  const sign = useSignContract(id)
  const voiding = useContractStep(id)
  const today = useDashboard().data?.today
  const c = contract.data

  const [name, setName] = React.useState("")
  const [signedOn, setSignedOn] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState("")
  const [touched, setTouched] = React.useState(false)

  const date = signedOn ?? today ?? ""
  const nameError =
    touched && !name.trim() ? "Who signed for the client?" : undefined
  const dateError = touched
    ? !ISO_DATE.test(date)
      ? "Use YYYY-MM-DD"
      : today && date > today
        ? "Can't be in the future"
        : undefined
    : undefined

  const submit = () => {
    setTouched(true)
    if (isVoid) {
      voiding.mutate(
        { step: "void", reason: reason.trim() || undefined },
        {
          onSuccess: () => router.back(),
          onError: (e) => Alert.alert("Couldn't void it", errorMessage(e)),
        }
      )
      return
    }
    if (!name.trim() || !ISO_DATE.test(date) || (today && date > today)) return
    sign.mutate(
      { signedByName: name.trim(), signedAt: date },
      {
        onSuccess: () => router.back(),
        onError: (e) =>
          Alert.alert("Couldn't record the signature", errorMessage(e)),
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
            <Title>{isVoid ? "Void contract" : "Record signature"}</Title>
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
            {contract.error ? (
              <Body>{errorMessage(contract.error)}</Body>
            ) : !c ? (
              <Body muted>Loading…</Body>
            ) : isVoid ? (
              <>
                <Body muted>
                  {`${c.number ?? "The contract"} with ${c.clientName} stops being in force. It stays on record, marked void.`}
                </Body>
                <Field
                  label="Reason"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Optional, e.g. replaced by a new contract"
                  maxLength={500}
                  multiline
                  textAlignVertical="top"
                  style={styles.reason}
                />
                <Button
                  title="Void contract"
                  variant="danger"
                  loading={voiding.isPending}
                  onPress={submit}
                />
              </>
            ) : (
              <>
                <Body muted>
                  {`For a signature you got outside the client portal, on paper or by email. ${c.number} becomes signed.`}
                </Body>
                <Field
                  label="Signed by"
                  value={name}
                  onChangeText={setName}
                  placeholder={`Who signed for ${c.clientName}`}
                  autoCapitalize="words"
                  autoComplete="name"
                  maxLength={200}
                  error={nameError}
                />
                <View style={styles.gap}>
                  <Field
                    label="Signed on"
                    value={date}
                    onChangeText={setSignedOn}
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
                          onPress={() => setSignedOn(value!)}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
                <Button
                  title="Record signature"
                  loading={sign.isPending}
                  disabled={!today}
                  onPress={submit}
                />
                <Body muted style={Type.small}>
                  Clients who sign in the portal are recorded on their own, with
                  a signature certificate on the PDF.
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
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  reason: { minHeight: 90, paddingTop: Spacing.three },
})
