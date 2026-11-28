import {
  displayDigits,
  EXPENSE_PAYMENT_METHOD_LABELS,
  type ExpensePaymentMethod,
  toMinorUnits,
} from "@workspace/contracts"
import { Image } from "expo-image"
import { router } from "expo-router"
import * as React from "react"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"

import {
  Button,
  Chip,
  confirm,
  DateField,
  Icon,
  KeyboardAvoid,
  MoneyInput,
  SheetFooter,
  SheetHeader,
  Text,
  TextField,
  toast,
} from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import { useCreateExpense, useExpenseCategories } from "@/features/expenses"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { normalizeAmount } from "@/lib/amount"
import { errorMessage } from "@/lib/api"
import { pickReceiptPhoto, type ReceiptPhoto } from "@/lib/receipt-photo"

/** What you'd pay a receipt with on the go, most likely first. */
const METHODS: ExpensePaymentMethod[] = [
  "card",
  "cash",
  "mobile_wallet",
  "bank_transfer",
  "other",
]

/**
 * Record an expense, receipt first: snap it, then the amount (in the
 * workspace's default currency), the date, who you paid and how. Other
 * currencies, clients and billable expenses are set on the web.
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
  const [photo, setPhoto] = React.useState<ReceiptPhoto | null>(null)
  const [amount, setAmount] = React.useState("")
  const [spentOn, setSpentOn] = React.useState<string | null>(null)
  const [vendor, setVendor] = React.useState("")
  const [categoryId, setCategoryId] = React.useState<string | null>(null)
  const [note, setNote] = React.useState("")
  const [method, setMethod] = React.useState<ExpensePaymentMethod>("card")
  const [picking, setPicking] = React.useState(false)
  const [touched, setTouched] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setDirty(true)
      set(v)
    }

  const date = spentOn ?? today ?? ""
  const minor = amount.trim()
    ? toMinorUnits(normalizeAmount(amount), currency)
    : null
  const valid = minor !== null && minor >= 1 && Boolean(date)
  const amountError = touched && !valid ? "Enter the amount" : undefined

  const pick = async (source: "camera" | "library") => {
    setPicking(true)
    try {
      const p = await pickReceiptPhoto(source)
      if (p) {
        setPhoto(p)
        setDirty(true)
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setPicking(false)
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
          vendor: vendor.trim() || null,
          description: note.trim() || null,
          categoryId,
          paymentMethod: method,
        },
        photo,
      },
      {
        onSuccess: ({ receiptError }) => {
          if (receiptError)
            toast.error(
              `Expense saved without the receipt: ${errorMessage(receiptError)} Attach it on the web.`
            )
          else
            toast.success(photo ? "Expense and receipt saved" : "Expense saved")
          router.back()
        },
        onError: (e) => toast.error(errorMessage(e)),
      }
    )
  }

  const close = async () => {
    if (
      dirty &&
      !(await confirm({
        title: "Discard this expense?",
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
      <SheetHeader title="Add expense" onClose={close} />
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {canAttach ? (
            photo ? (
              <View style={[styles.photo, { borderColor: t.border }]}>
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.image}
                  contentFit="cover"
                  accessibilityLabel="The receipt"
                />
                <View style={[styles.photoBar, { backgroundColor: t.scrim }]}>
                  <Text variant="label" style={{ color: t.onScrim, flex: 1 }}>
                    Receipt attached
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Take another photo"
                    onPress={() => void pick("camera")}
                    style={styles.overlayBtn}
                  >
                    <Icon name="camera" size={22} color={t.onScrim} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove the receipt"
                    onPress={() => setPhoto(null)}
                    style={styles.overlayBtn}
                  >
                    <Icon name="trash" size={22} color={t.onScrim} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.drop,
                  {
                    borderColor: t.borderStrong,
                    backgroundColor: t.surfaceMuted,
                  },
                ]}
              >
                <Icon name="receipt" size={32} tone="muted" />
                <Text variant="callout" tone="muted" style={styles.center}>
                  Snap the receipt first. It's saved with the expense.
                </Text>
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={picking}
                    onPress={() => void pick("camera")}
                    style={({ pressed }) => [
                      styles.pick,
                      {
                        backgroundColor: t.primary,
                        opacity: pressed || picking ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Icon name="camera" size={20} color={t.onPrimary} />
                    <Text
                      variant="label"
                      style={{ color: t.onPrimary, fontWeight: "600" }}
                    >
                      Take photo
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={picking}
                    onPress={() => void pick("library")}
                    style={({ pressed }) => [
                      styles.pick,
                      {
                        backgroundColor: t.surface,
                        borderColor: t.borderStrong,
                        borderWidth: 1,
                        opacity: pressed || picking ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Icon name="image" size={20} tone="default" />
                    <Text variant="label" style={{ fontWeight: "600" }}>
                      Gallery
                    </Text>
                  </Pressable>
                </View>
              </View>
            )
          ) : null}

          <MoneyInput
            value={amount}
            onChangeText={change(setAmount)}
            currency={currency}
            tone="out"
            decimals={displayDigits(currency) > 0}
            error={amountError}
          />
          <Text variant="caption" tone="muted">
            Tax included. Other currencies are on the web.
          </Text>

          {today ? (
            <DateField
              label="Date"
              value={date}
              onChange={(d) => change(setSpentOn)(d ?? today)}
              today={today}
              locale={locale}
            />
          ) : null}

          <TextField
            label="Paid to"
            icon="building"
            value={vendor}
            onChangeText={change(setVendor)}
            placeholder="e.g. City Mart, Grab"
            autoCapitalize="words"
            maxLength={200}
          />

          {categories.data && categories.data.length > 0 ? (
            <View style={styles.group}>
              <Text variant="label" tone="muted">
                Category
              </Text>
              <View style={styles.wrap}>
                {categories.data.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    selected={categoryId === c.id}
                    onPress={() =>
                      change(setCategoryId)(categoryId === c.id ? null : c.id)
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.group}>
            <Text variant="label" tone="muted">
              Paid with
            </Text>
            <View style={styles.wrap}>
              {METHODS.map((m) => (
                <Chip
                  key={m}
                  label={EXPENSE_PAYMENT_METHOD_LABELS[m]}
                  selected={method === m}
                  onPress={() => change(setMethod)(m)}
                />
              ))}
            </View>
          </View>

          <TextField
            label="Note"
            value={note}
            onChangeText={change(setNote)}
            placeholder="Optional"
            maxLength={500}
            multiline
          />
        </ScrollView>
        <SheetFooter>
          <Button
            title={photo ? "Save expense and receipt" : "Save expense"}
            loading={save.isPending}
            onPress={submit}
          />
        </SheetFooter>
      </KeyboardAvoid>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space[4], gap: Space[4], paddingBottom: Space[8] },
  center: { textAlign: "center" },
  drop: {
    alignItems: "center",
    gap: Space[3],
    padding: Space[5],
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: Radius.lg,
  },
  row: { flexDirection: "row", gap: Space[3] },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[2],
    height: 44,
    paddingHorizontal: Space[4],
    borderRadius: Radius.md,
  },
  photo: {
    height: 220,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  photoBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Space[4],
  },
  overlayBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  group: { gap: Space[2] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Space[2] },
})
