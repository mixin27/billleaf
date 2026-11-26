import {
  addDays,
  type CashbookEntryType,
  formatMoney,
  fromMinorUnits,
  toMinorUnits,
} from "@workspace/contracts"
import { Image } from "expo-image"
import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { create } from "zustand"

import {
  Button,
  Chip,
  Field,
  KeyboardAvoid,
  Screen,
  Title,
} from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import {
  can,
  useCashbook,
  useCashbookEntry,
  useCashbookOptions,
  useRemoveAttachment,
  useSaveEntry,
  useSaveOption,
} from "@/features/cashbook"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { normalizeAmount } from "@/lib/amount"
import { errorMessage } from "@/lib/api"
import { normalizeClock, nowIn } from "@/lib/cashbook"
import { pickReceiptPhoto, type ReceiptPhoto } from "@/lib/receipt-photo"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Last category, mode and contact used per book, so the next entry is quick. */
const useLast = create<{
  byBook: Record<string, { categoryId?: string | null; modeId?: string | null }>
  remember: (
    bookId: string,
    v: { categoryId?: string | null; modeId?: string | null }
  ) => void
}>((set) => ({
  byBook: {},
  remember: (bookId, v) =>
    set((s) => ({ byBook: { ...s.byBook, [bookId]: v } })),
}))

/**
 * Add a cash in or cash out entry (or edit one with `entryId`). The amount
 * has focus straight away; "Save and add new" keeps the screen open.
 */
export default function CashbookEntryEditScreen() {
  const params = useLocalSearchParams<{
    bookId: string
    entryId?: string
    type?: CashbookEntryType
  }>()
  const { bookId, entryId } = params
  const t = useTheme()
  const profile = useWorkspaceProfile()
  const locale =
    profile.data?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const book = useCashbook(bookId)
  const b = book.data
  const existing = useCashbookEntry(bookId, entryId ?? "")
  const categories = useCashbookOptions(bookId, "categories")
  const modes = useCashbookOptions(bookId, "modes")
  const save = useSaveEntry(bookId)
  const removeAttachment = useRemoveAttachment(bookId, entryId ?? "")
  const addCategory = useSaveOption(bookId, "categories")
  const last = useLast((s) => s.byBook[bookId])
  const remember = useLast((s) => s.remember)
  const editing = Boolean(entryId)
  const fields = b?.fields ?? { contact: true, category: true, mode: true }
  const currency = b?.currency ?? "USD"

  const [type, setType] = React.useState<CashbookEntryType>(params.type ?? "in")
  const [amount, setAmount] = React.useState("")
  const [date, setDate] = React.useState("")
  const [time, setTime] = React.useState("")
  const [remark, setRemark] = React.useState("")
  const [contact, setContact] = React.useState("")
  const [categoryId, setCategoryId] = React.useState<string | null>(null)
  const [modeId, setModeId] = React.useState<string | null>(null)
  const [photos, setPhotos] = React.useState<ReceiptPhoto[]>([])
  const [picking, setPicking] = React.useState(false)
  const [newCategory, setNewCategory] = React.useState<string | null>(null)
  const [touched, setTouched] = React.useState(false)
  const amountRef = React.useRef<React.ComponentRef<typeof TextInput>>(null)

  // New entry: now, and the last category and mode; editing: the entry.
  const loaded = React.useRef(false)
  React.useEffect(() => {
    if (loaded.current) return
    if (editing) {
      const e = existing.data
      if (!e) return
      setType(e.type)
      setAmount(fromMinorUnits(e.amount, currency))
      setDate(e.entryDate)
      setTime(e.entryTime)
      setRemark(e.remark ?? "")
      setContact(e.contactName ?? "")
      setCategoryId(e.categoryId)
      setModeId(e.modeId)
    } else {
      if (!profile.data || !modes.data) return
      const now = nowIn(profile.data.timezone)
      setDate(now.date)
      setTime(now.time)
      setCategoryId(last?.categoryId ?? null)
      setModeId(
        last?.modeId ?? modes.data.find((m) => m.name === "Cash")?.id ?? null
      )
    }
    loaded.current = true
  }, [editing, existing.data, profile.data, modes.data, last, currency])

  const today = nowIn(profile.data?.timezone).date
  const minor = amount.trim()
    ? toMinorUnits(normalizeAmount(amount), currency)
    : null
  const clock = normalizeClock(time)
  const amountError =
    touched && (minor === null || minor < 1) ? "Enter the amount" : undefined
  const dateError =
    touched && !ISO_DATE.test(date) ? "Use YYYY-MM-DD" : undefined
  const timeError = touched && !clock ? "Use HH:MM (24-hour)" : undefined
  const valid = minor !== null && minor >= 1 && ISO_DATE.test(date) && clock

  const pick = async (source: "camera" | "library") => {
    setPicking(true)
    try {
      const p = await pickReceiptPhoto(source)
      if (p) setPhotos((ps) => [...ps, p])
    } catch (e) {
      Alert.alert("Couldn't use that photo", errorMessage(e))
    } finally {
      setPicking(false)
    }
  }

  const reset = () => {
    setAmount("")
    setRemark("")
    setContact("")
    setPhotos([])
    setTouched(false)
    const now = nowIn(profile.data?.timezone)
    setDate(now.date)
    setTime(now.time)
    amountRef.current?.focus()
  }

  const submit = (again: boolean) => {
    setTouched(true)
    if (!valid) return
    save.mutate(
      {
        id: entryId,
        body: {
          type,
          amount: minor!,
          entryDate: date,
          entryTime: clock!,
          remark: remark || null,
          contactName: fields.contact ? contact || null : undefined,
          categoryId: fields.category ? categoryId : undefined,
          modeId: fields.mode ? modeId : undefined,
        },
        photos,
      },
      {
        onSuccess: ({ attachmentError }) => {
          remember(bookId, { categoryId, modeId })
          if (attachmentError)
            Alert.alert(
              "Saved without the photo",
              `${errorMessage(attachmentError)} You can add it from the entry.`
            )
          if (again) reset()
          else router.back()
        },
        onError: (e) => Alert.alert("Couldn't save the entry", errorMessage(e)),
      }
    )
  }

  const createCategory = () => {
    const name = newCategory?.trim()
    if (!name) return
    addCategory.mutate(
      { name },
      {
        onSuccess: (c) => {
          setCategoryId(c.id)
          setNewCategory(null)
          void categories.refetch()
        },
        onError: (e) => Alert.alert("Couldn't add it", errorMessage(e)),
      }
    )
  }

  const color = type === "in" ? t.primary : t.danger
  const title = `${editing ? "Edit" : "Add"} cash ${type} entry`

  return (
    <Screen>
      <SafeAreaView
        style={styles.flex}
        edges={Platform.OS === "android" ? ["top", "bottom"] : ["bottom"]}
      >
        <KeyboardAvoid>
          <View style={styles.header}>
            <Title style={styles.title}>{title}</Title>
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
            <View style={styles.row}>
              {(["in", "out"] as const).map((k) => {
                const on = type === k
                const c = k === "in" ? t.primary : t.danger
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setType(k)}
                    style={[
                      styles.toggle,
                      {
                        borderColor: on ? c : t.border,
                        backgroundColor: on ? c : t.background,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        Type.body,
                        styles.bold,
                        { color: on ? "#FFFFFF" : t.text },
                      ]}
                    >
                      {k === "in" ? "Cash in" : "Cash out"}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={styles.row}>
              <View style={styles.flex}>
                <Field
                  label="Date"
                  value={date}
                  onChangeText={setDate}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                  maxLength={10}
                  error={dateError}
                />
              </View>
              <View style={styles.time}>
                <Field
                  label="Time"
                  value={time}
                  onChangeText={setTime}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                  maxLength={5}
                  error={timeError}
                />
              </View>
            </View>
            <View style={styles.wrap}>
              {[
                ["Today", today],
                ["Yesterday", addDays(today, -1)],
              ].map(([label, value]) => (
                <Chip
                  key={label}
                  label={label!}
                  selected={date === value}
                  onPress={() => setDate(value!)}
                />
              ))}
            </View>

            <View style={styles.gap}>
              <Text style={[Type.small, styles.bold, { color: t.text }]}>
                {`Amount (${currency})`}
              </Text>
              <TextInput
                ref={amountRef}
                accessibilityLabel={`Amount in ${currency}`}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                autoFocus={!editing}
                placeholder={formatMoney({ amount: 0, currency }, locale)}
                placeholderTextColor={t.textSecondary}
                style={[
                  styles.amount,
                  {
                    color,
                    borderColor: amountError ? t.danger : color,
                    backgroundColor: t.backgroundElement,
                  },
                ]}
              />
              {amountError ? (
                <Text style={[Type.small, { color: t.danger }]}>
                  {amountError}
                </Text>
              ) : null}
            </View>

            {fields.contact ? (
              <Field
                label="Contact name"
                value={contact}
                onChangeText={setContact}
                placeholder="Optional, e.g. Ko Aung"
                autoCapitalize="words"
                maxLength={120}
              />
            ) : null}

            <Field
              label="Remark"
              value={remark}
              onChangeText={setRemark}
              placeholder="e.g. Daily sales, rice bags"
              maxLength={500}
              multiline
            />

            {fields.category ? (
              <View style={styles.gap}>
                <Text style={[Type.small, styles.bold, { color: t.text }]}>
                  Category
                </Text>
                <View style={styles.wrap}>
                  {(categories.data ?? [])
                    .filter((c) => !c.archived || c.id === categoryId)
                    .map((c) => (
                      <Chip
                        key={c.id}
                        label={c.name}
                        selected={categoryId === c.id}
                        onPress={() =>
                          setCategoryId(categoryId === c.id ? null : c.id)
                        }
                      />
                    ))}
                  {can.manage(b) && newCategory === null ? (
                    <Chip
                      label="+ Add new"
                      selected={false}
                      onPress={() => setNewCategory("")}
                    />
                  ) : null}
                </View>
                {newCategory !== null ? (
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Field
                        label="New category"
                        value={newCategory}
                        onChangeText={setNewCategory}
                        autoFocus
                        maxLength={60}
                        returnKeyType="done"
                        onSubmitEditing={createCategory}
                      />
                    </View>
                    <View style={styles.addBtn}>
                      <Button
                        title="Add"
                        variant="secondary"
                        loading={addCategory.isPending}
                        onPress={createCategory}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {fields.mode ? (
              <View style={styles.gap}>
                <Text style={[Type.small, styles.bold, { color: t.text }]}>
                  Payment mode
                </Text>
                <View style={styles.wrap}>
                  {(modes.data ?? [])
                    .filter((m) => !m.archived || m.id === modeId)
                    .map((m) => (
                      <Chip
                        key={m.id}
                        label={m.name}
                        selected={modeId === m.id}
                        onPress={() => setModeId(modeId === m.id ? null : m.id)}
                      />
                    ))}
                </View>
              </View>
            ) : null}

            <View style={styles.gap}>
              <Text style={[Type.small, styles.bold, { color: t.text }]}>
                Attachments
              </Text>
              <View style={styles.wrap}>
                {existing.data?.attachments.map((a) => (
                  <Thumb
                    key={a.id}
                    uri={a.contentType.startsWith("image/") ? a.url : null}
                    label={a.filename}
                    onRemove={() =>
                      Alert.alert("Remove this attachment?", a.filename, [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () =>
                            removeAttachment.mutate(a.id, {
                              onSuccess: () => void existing.refetch(),
                              onError: (e) =>
                                Alert.alert(
                                  "Couldn't remove it",
                                  errorMessage(e)
                                ),
                            }),
                        },
                      ])
                    }
                  />
                ))}
                {photos.map((p, i) => (
                  <Thumb
                    key={p.uri}
                    uri={p.uri}
                    label="New photo"
                    onRemove={() =>
                      setPhotos((ps) => ps.filter((_, j) => j !== i))
                    }
                  />
                ))}
              </View>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Button
                    title="Take photo"
                    variant="secondary"
                    disabled={picking}
                    onPress={() => pick("camera")}
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    title="Choose photo"
                    variant="secondary"
                    disabled={picking}
                    onPress={() => pick("library")}
                  />
                </View>
              </View>
            </View>

            <View style={styles.row}>
              {!editing ? (
                <View style={styles.flex}>
                  <Button
                    title="Save and add new"
                    variant="secondary"
                    disabled={save.isPending}
                    onPress={() => submit(true)}
                  />
                </View>
              ) : null}
              <View style={styles.flex}>
                <Button
                  title="Save"
                  variant={type === "in" ? "primary" : "danger"}
                  loading={save.isPending}
                  onPress={() => submit(false)}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoid>
      </SafeAreaView>
    </Screen>
  )
}

function Thumb({
  uri,
  label,
  onRemove,
}: {
  uri: string | null
  label: string
  onRemove: () => void
}) {
  const t = useTheme()
  return (
    <View
      style={[
        styles.thumb,
        { borderColor: t.border, backgroundColor: t.backgroundElement },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.thumbImage}
          contentFit="cover"
          accessibilityLabel={label}
        />
      ) : (
        <Text
          style={[Type.small, styles.pdf, { color: t.textSecondary }]}
          numberOfLines={3}
        >
          {label}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label}`}
        hitSlop={8}
        onPress={onRemove}
        style={[styles.remove, { backgroundColor: t.text }]}
      >
        <Text style={[styles.removeText, { color: t.background }]}>✕</Text>
      </Pressable>
    </View>
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
    gap: Spacing.two,
  },
  title: { flex: 1, fontSize: 22 },
  content: { padding: Spacing.four, gap: Spacing.four },
  row: { flexDirection: "row", gap: Spacing.two, alignItems: "flex-end" },
  gap: { gap: Spacing.two },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  bold: { fontWeight: "600" },
  time: { width: 110 },
  toggle: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  amount: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 28,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  addBtn: { width: 90 },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImage: { width: "100%", height: "100%" },
  pdf: { padding: Spacing.one, textAlign: "center" },
  remove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { fontSize: 11, fontWeight: "700" },
})
