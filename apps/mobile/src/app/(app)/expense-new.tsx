import {
  addDays,
  EXPENSE_PAYMENT_METHOD_LABELS,
  type ExpensePaymentMethod,
  formatMoney,
  toMinorUnits,
} from "@workspace/contracts"
import { Image } from "expo-image"
import { router } from "expo-router"
import * as React from "react"
import {
  Alert,
  Platform,
  Pressable,
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
import { Radius, Spacing, Type } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import { useCreateExpense, useExpenseCategories } from "@/features/expenses"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { normalizeAmount } from "@/lib/amount"
import { errorMessage } from "@/lib/api"
import { pickReceiptPhoto, type ReceiptPhoto } from "@/lib/receipt-photo"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** What you'd pay a receipt with on the go, most likely first. */
const METHODS: ExpensePaymentMethod[] = [
  "card",
  "cash",
  "mobile_wallet",
  "bank_transfer",
  "other",
]

/**
 * Record an expense with a photo of its receipt. Amounts are in the
 * workspace's default currency (other currencies, clients and billable
 * expenses are set on the web).
 */
export default function NewExpenseScreen() {
  const t = useTheme()
  const me = useMe()
  const profile = useWorkspaceProfile()
  const today = useDashboard().data?.today
  const categories = useExpenseCategories()
  const save = useCreateExpense()
  const canAttach = me.data?.permissions.includes("expense.update") ?? false

  const currency = profile.data?.defaultCurrency ?? "USD"
  const locale =
    profile.data?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const [photo, setPhoto] = React.useState<
    (ReceiptPhoto & { source: "camera" | "library" }) | null
  >(null)
  const [amount, setAmount] = React.useState("")
  const [spentOn, setSpentOn] = React.useState<string | null>(null)
  const [vendor, setVendor] = React.useState("")
  const [categoryId, setCategoryId] = React.useState<string | null>(null)
  const [note, setNote] = React.useState("")
  const [method, setMethod] = React.useState<ExpensePaymentMethod>("card")
  /** Which button is opening the camera or library (for its spinner). */
  const [picking, setPicking] = React.useState<"camera" | "library" | null>(
    null
  )
  const [touched, setTouched] = React.useState(false)

  const date = spentOn ?? today ?? ""
  const minor = amount.trim()
    ? toMinorUnits(normalizeAmount(amount), currency)
    : null
  const amountError =
    touched && (minor === null || minor < 1) ? "Enter the amount" : undefined
  const dateError =
    touched && !ISO_DATE.test(date) ? "Use YYYY-MM-DD" : undefined
  const valid = minor !== null && minor >= 1 && ISO_DATE.test(date)

  const pick = async (source: "camera" | "library") => {
    setPicking(source)
    try {
      const p = await pickReceiptPhoto(source)
      if (p) setPhoto({ ...p, source })
    } catch (e) {
      Alert.alert("Couldn't use that photo", errorMessage(e))
    } finally {
      setPicking(null)
    }
  }

  const submit = () => {
    setTouched(true)
    if (!valid) return
    save.mutate(
      {
        body: {
          spentOn: date,
          amount: minor!,
          currency,
          vendor: vendor || null,
          description: note || null,
          categoryId,
          paymentMethod: method,
        },
        photo,
      },
      {
        onSuccess: ({ receiptError }) => {
          if (receiptError)
            Alert.alert(
              "Saved without the receipt",
              `${errorMessage(receiptError)} You can attach it on the web.`
            )
          router.back()
        },
        onError: (e) =>
          Alert.alert("Couldn't save the expense", errorMessage(e)),
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
            <Title>New expense</Title>
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
            {canAttach ? (
              photo ? (
                <View style={styles.photoWrap}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={[
                      styles.photo,
                      { aspectRatio: photo.width / photo.height || 0.75 },
                    ]}
                    contentFit="contain"
                    accessibilityLabel="Receipt photo"
                  />
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Button
                        title={
                          photo.source === "camera"
                            ? "Retake"
                            : "Choose another"
                        }
                        variant="secondary"
                        loading={picking !== null}
                        onPress={() => pick(photo.source)}
                      />
                    </View>
                    <View style={styles.flex}>
                      <Button
                        title="Remove"
                        variant="secondary"
                        onPress={() => setPhoto(null)}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    styles.dropzone,
                    {
                      borderColor: t.border,
                      backgroundColor: t.backgroundElement,
                    },
                  ]}
                >
                  <Body muted style={styles.center}>
                    Add a photo of the receipt
                  </Body>
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Button
                        title="Take photo"
                        loading={picking === "camera"}
                        disabled={picking !== null}
                        onPress={() => pick("camera")}
                      />
                    </View>
                    <View style={styles.flex}>
                      <Button
                        title="Choose photo"
                        variant="secondary"
                        loading={picking === "library"}
                        disabled={picking !== null}
                        onPress={() => pick("library")}
                      />
                    </View>
                  </View>
                </View>
              )
            ) : null}

            <Field
              label={`Amount (${currency}, tax included)`}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={formatMoney({ amount: 0, currency }, locale)}
              error={amountError}
            />

            <View style={styles.gap}>
              <Field
                label="Date"
                value={date}
                onChangeText={setSpentOn}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                maxLength={10}
                error={dateError}
              />
              {today ? (
                <View style={styles.chips}>
                  {[
                    ["Today", today],
                    ["Yesterday", addDays(today, -1)],
                  ].map(([label, value]) => (
                    <Chip
                      key={label}
                      label={label!}
                      selected={date === value}
                      onPress={() => setSpentOn(value!)}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            <Field
              label="Vendor"
              value={vendor}
              onChangeText={setVendor}
              placeholder="Who you paid"
              maxLength={200}
            />

            {categories.data && categories.data.length > 0 ? (
              <View style={styles.gap}>
                <Text style={[Type.small, styles.label, { color: t.text }]}>
                  Category
                </Text>
                <View style={styles.wrap}>
                  {categories.data.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      selected={categoryId === c.id}
                      onPress={() =>
                        setCategoryId(categoryId === c.id ? null : c.id)
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.gap}>
              <Text style={[Type.small, styles.label, { color: t.text }]}>
                Paid with
              </Text>
              <View style={styles.wrap}>
                {METHODS.map((m) => (
                  <Chip
                    key={m}
                    label={EXPENSE_PAYMENT_METHOD_LABELS[m]}
                    selected={method === m}
                    onPress={() => setMethod(m)}
                  />
                ))}
              </View>
            </View>

            <Field
              label="Note"
              value={note}
              onChangeText={setNote}
              placeholder="Optional"
              maxLength={1000}
              multiline
            />

            <Button
              title={photo ? "Save expense and receipt" : "Save expense"}
              loading={save.isPending}
              disabled={!today}
              onPress={submit}
            />
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
  photoWrap: { gap: Spacing.two },
  photo: { width: "100%", maxHeight: 360, borderRadius: Radius.md },
  dropzone: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  center: { textAlign: "center" },
  row: { flexDirection: "row", gap: Spacing.two },
  gap: { gap: Spacing.two },
  label: { fontWeight: "600" },
  chips: { flexDirection: "row", gap: Spacing.two },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
})
