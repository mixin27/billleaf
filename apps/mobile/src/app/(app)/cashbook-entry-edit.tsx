import {
  type CashbookEntryType,
  displayDigits,
  fromMinorUnits,
  toMinorUnits,
} from "@workspace/contracts"
import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, type TextInput, View } from "react-native"
import { create } from "zustand"

import { PhotoThumb } from "@/components/cashbook/photo-thumb"
import {
  Button,
  Chip,
  confirm,
  DateField,
  KeyboardAvoid,
  MoneyInput,
  SegmentedControl,
  SheetFooter,
  SheetHeader,
  Text,
  TextField,
  TimeField,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
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
import { nowIn } from "@/lib/cashbook"
import { haptic } from "@/lib/haptics"
import { pickReceiptPhoto, type ReceiptPhoto } from "@/lib/receipt-photo"

/** Last category and mode used per book, so the next entry is quick. */
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
 * Add a cash in or cash out entry (or edit one with `entryId`): the
 * amount has focus straight away, the In / Out switch recolours the
 * sheet, and "Save & add new" keeps it open for the next one.
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
  const today = nowIn(profile.data?.timezone).date

  const [type, setType] = React.useState<CashbookEntryType>(params.type ?? "in")
  const [amount, setAmount] = React.useState("")
  const [date, setDate] = React.useState(today)
  const [time, setTime] = React.useState(nowIn(profile.data?.timezone).time)
  const [remark, setRemark] = React.useState("")
  const [contact, setContact] = React.useState("")
  const [categoryId, setCategoryId] = React.useState<string | null>(null)
  const [modeId, setModeId] = React.useState<string | null>(null)
  const [photos, setPhotos] = React.useState<ReceiptPhoto[]>([])
  const [picking, setPicking] = React.useState(false)
  const [newCategory, setNewCategory] = React.useState<string | null>(null)
  const [touched, setTouched] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const amountRef = React.useRef<React.ComponentRef<typeof TextInput>>(null)
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setDirty(true)
      set(v)
    }

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

  const minor = amount.trim()
    ? toMinorUnits(normalizeAmount(amount), currency)
    : null
  const valid = minor !== null && minor >= 1
  const amountError = touched && !valid ? "Enter the amount" : undefined
  const tone = type === "in" ? "in" : "out"

  const pick = async (source: "camera" | "library") => {
    setPicking(true)
    try {
      const p = await pickReceiptPhoto(source)
      if (p) {
        setPhotos((ps) => [...ps, p])
        setDirty(true)
      }
    } catch (e) {
      toast.error(errorMessage(e))
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
    setDirty(false)
    const now = nowIn(profile.data?.timezone)
    setDate(now.date)
    setTime(now.time)
    amountRef.current?.focus()
  }

  const submit = (again: boolean) => {
    setTouched(true)
    if (!valid) {
      haptic.warning()
      return
    }
    save.mutate(
      {
        id: entryId,
        body: {
          type,
          amount: minor,
          entryDate: date,
          entryTime: time,
          remark: remark.trim() || null,
          contactName: fields.contact ? contact.trim() || null : undefined,
          categoryId: fields.category ? categoryId : undefined,
          modeId: fields.mode ? modeId : undefined,
        },
        photos,
      },
      {
        onSuccess: ({ attachmentError }) => {
          remember(bookId, { categoryId, modeId })
          const what = type === "in" ? "Cash in" : "Cash out"
          if (attachmentError)
            toast.error(
              `${what} saved without the photo: ${errorMessage(attachmentError)} Add it from the entry.`
            )
          else toast.success(editing ? "Entry updated" : `${what} added`)
          if (again) reset()
          else router.back()
        },
        onError: (e) => toast.error(errorMessage(e)),
      }
    )
  }

  const close = async () => {
    if (
      dirty &&
      !(await confirm({
        title: "Discard this entry?",
        message: "What you've typed isn't saved.",
        confirmLabel: "Discard",
        destructive: true,
      }))
    )
      return
    router.back()
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
        onError: (e) => toast.error(errorMessage(e)),
      }
    )
  }

  const removeExisting = async (id: string, name: string) => {
    if (
      !(await confirm({
        title: "Remove this attachment?",
        message: name,
        confirmLabel: "Remove",
        destructive: true,
      }))
    )
      return
    removeAttachment.mutate(id, {
      onSuccess: () => void existing.refetch(),
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader
        title={editing ? "Edit entry" : type === "in" ? "Cash in" : "Cash out"}
        onClose={close}
      />
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <SegmentedControl
            options={[
              { value: "in", label: "Cash in" },
              { value: "out", label: "Cash out" },
            ]}
            value={type}
            onChange={change(setType)}
            tones={{ in: "in", out: "out" }}
          />

          <MoneyInput
            inputRef={amountRef}
            value={amount}
            onChangeText={change(setAmount)}
            currency={currency}
            tone={tone}
            decimals={displayDigits(currency) > 0}
            autoFocus={!editing}
            error={amountError}
          />

          <View style={styles.when}>
            <View style={styles.flex}>
              <DateField
                label="Date"
                value={date}
                onChange={(d) => change(setDate)(d ?? today)}
                today={today}
                locale={locale}
              />
            </View>
            <View style={styles.time}>
              <TimeField
                label="Time"
                value={time}
                onChange={change(setTime)}
                locale={locale}
              />
            </View>
          </View>

          <TextField
            label="Remark"
            value={remark}
            onChangeText={change(setRemark)}
            placeholder="e.g. Daily sales, rice bags"
            maxLength={500}
            multiline
          />
          {fields.contact ? (
            <TextField
              label="Contact"
              icon="user"
              value={contact}
              onChangeText={change(setContact)}
              placeholder="Optional, e.g. Ko Aung"
              autoCapitalize="words"
              maxLength={120}
            />
          ) : null}

          {fields.category ? (
            <View style={styles.group}>
              <Text variant="label" tone="muted">
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
                        change(setCategoryId)(categoryId === c.id ? null : c.id)
                      }
                    />
                  ))}
                {can.manage(b) && newCategory === null ? (
                  <Chip
                    label="New"
                    icon="plus"
                    selected={false}
                    onPress={() => setNewCategory("")}
                  />
                ) : null}
              </View>
              {newCategory !== null ? (
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <TextField
                      label="New category"
                      value={newCategory}
                      onChangeText={setNewCategory}
                      autoFocus
                      maxLength={60}
                      returnKeyType="done"
                      onSubmitEditing={createCategory}
                    />
                  </View>
                  <Button
                    title="Add"
                    variant="secondary"
                    fullWidth={false}
                    loading={addCategory.isPending}
                    onPress={createCategory}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {fields.mode ? (
            <View style={styles.group}>
              <Text variant="label" tone="muted">
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
                      onPress={() =>
                        change(setModeId)(modeId === m.id ? null : m.id)
                      }
                    />
                  ))}
              </View>
            </View>
          ) : null}

          <View style={styles.group}>
            <Text variant="label" tone="muted">
              Photos
            </Text>
            {existing.data?.attachments.length || photos.length ? (
              <View style={styles.wrap}>
                {existing.data?.attachments.map((a) => (
                  <PhotoThumb
                    key={a.id}
                    uri={a.contentType.startsWith("image/") ? a.url : null}
                    label={a.filename}
                    onRemove={() => void removeExisting(a.id, a.filename)}
                  />
                ))}
                {photos.map((p, i) => (
                  <PhotoThumb
                    key={p.uri}
                    uri={p.uri}
                    label="New photo"
                    onRemove={() =>
                      setPhotos((ps) => ps.filter((_, j) => j !== i))
                    }
                  />
                ))}
              </View>
            ) : null}
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button
                  title="Camera"
                  icon="camera"
                  variant="secondary"
                  size="sm"
                  disabled={picking}
                  onPress={() => pick("camera")}
                />
              </View>
              <View style={styles.flex}>
                <Button
                  title="Gallery"
                  icon="image"
                  variant="secondary"
                  size="sm"
                  disabled={picking}
                  onPress={() => pick("library")}
                />
              </View>
            </View>
          </View>
        </ScrollView>
        <SheetFooter>
          {!editing ? (
            <Button
              title="Save & add new"
              variant="secondary"
              disabled={save.isPending}
              onPress={() => submit(true)}
            />
          ) : null}
          <Button
            title="Save"
            variant={tone}
            loading={save.isPending}
            onPress={() => submit(false)}
          />
        </SheetFooter>
      </KeyboardAvoid>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space[4], gap: Space[4], paddingBottom: Space[8] },
  row: { flexDirection: "row", gap: Space[3], alignItems: "flex-end" },
  when: { flexDirection: "row", gap: Space[3], alignItems: "flex-start" },
  time: { width: 130 },
  group: { gap: Space[2] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Space[2] },
})
