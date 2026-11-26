import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import {
  Button,
  Chip,
  Field,
  KeyboardAvoid,
  Screen,
  Title,
} from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import {
  type BookFilters,
  useBookFilters,
  useCashbook,
  useCashbookMembers,
  useCashbookOptions,
  useFiltersFor,
} from "@/features/cashbook"
import { useTheme } from "@/hooks/use-theme"
import { DURATIONS } from "@/lib/cashbook"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** All of a book's filters on one sheet; Apply puts them on the book. */
export default function BookFiltersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const current = useFiltersFor(id)
  const setFilters = useBookFilters((s) => s.set)
  const book = useCashbook(id)
  const categories = useCashbookOptions(id, "categories")
  const modes = useCashbookOptions(id, "modes")
  const members = useCashbookMembers(id)
  const [f, setF] = React.useState<BookFilters>(current)
  const patch = (p: Partial<BookFilters>) => setF((x) => ({ ...x, ...p }))
  const fields = book.data?.fields
  const badDate =
    f.duration === "custom" &&
    ((f.from && !ISO_DATE.test(f.from)) || (f.to && !ISO_DATE.test(f.to)))

  const group = (
    label: string,
    items: { id: string; name: string }[] | undefined,
    value: string | undefined,
    set: (v: string | undefined) => void
  ) =>
    items && items.length ? (
      <View style={styles.gap}>
        <Text style={[Type.small, styles.bold, { color: t.text }]}>
          {label}
        </Text>
        <View style={styles.wrap}>
          <Chip label="All" selected={!value} onPress={() => set(undefined)} />
          {items.map((o) => (
            <Chip
              key={o.id}
              label={o.name}
              selected={value === o.id}
              onPress={() => set(o.id)}
            />
          ))}
        </View>
      </View>
    ) : null

  return (
    <Screen>
      <SafeAreaView
        style={styles.flex}
        edges={Platform.OS === "android" ? ["top", "bottom"] : ["bottom"]}
      >
        <KeyboardAvoid>
          <View style={styles.header}>
            <Title>Filters</Title>
            <Button
              title="Cancel"
              variant="link"
              onPress={() => router.back()}
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.gap}>
              <Text style={[Type.small, styles.bold, { color: t.text }]}>
                Duration
              </Text>
              <View style={styles.wrap}>
                {[
                  ...DURATIONS,
                  { value: "custom" as const, label: "Custom" },
                ].map((d) => (
                  <Chip
                    key={d.value}
                    label={d.label}
                    selected={f.duration === d.value}
                    onPress={() => patch({ duration: d.value })}
                  />
                ))}
              </View>
              {f.duration === "custom" ? (
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Field
                      label="From"
                      value={f.from ?? ""}
                      onChangeText={(v) => patch({ from: v || undefined })}
                      placeholder="YYYY-MM-DD"
                      keyboardType="numbers-and-punctuation"
                      maxLength={10}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Field
                      label="To"
                      value={f.to ?? ""}
                      onChangeText={(v) => patch({ to: v || undefined })}
                      placeholder="YYYY-MM-DD"
                      keyboardType="numbers-and-punctuation"
                      maxLength={10}
                      error={badDate ? "Use YYYY-MM-DD" : undefined}
                    />
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.gap}>
              <Text style={[Type.small, styles.bold, { color: t.text }]}>
                Entry type
              </Text>
              <View style={styles.wrap}>
                <Chip
                  label="All"
                  selected={!f.type}
                  onPress={() => patch({ type: undefined })}
                />
                <Chip
                  label="Cash in"
                  selected={f.type === "in"}
                  onPress={() => patch({ type: "in" })}
                />
                <Chip
                  label="Cash out"
                  selected={f.type === "out"}
                  onPress={() => patch({ type: "out" })}
                />
              </View>
            </View>

            {fields?.category !== false
              ? group("Category", categories.data, f.categoryId, (v) =>
                  patch({ categoryId: v })
                )
              : null}
            {fields?.mode !== false
              ? group("Payment mode", modes.data, f.modeId, (v) =>
                  patch({ modeId: v })
                )
              : null}
            {members.data && members.data.length > 1
              ? group(
                  "Entry by",
                  members.data.map((m) => ({ id: m.memberId, name: m.name })),
                  f.memberId,
                  (v) => patch({ memberId: v })
                )
              : null}

            <View style={styles.row}>
              <View style={styles.flex}>
                <Button
                  title="Clear all"
                  variant="secondary"
                  onPress={() => {
                    setFilters(id, {
                      duration: "all",
                      from: undefined,
                      to: undefined,
                      type: undefined,
                      categoryId: undefined,
                      modeId: undefined,
                      memberId: undefined,
                    })
                    router.back()
                  }}
                />
              </View>
              <View style={styles.flex}>
                <Button
                  title="Apply"
                  disabled={Boolean(badDate)}
                  onPress={() => {
                    setFilters(id, f)
                    router.back()
                  }}
                />
              </View>
            </View>
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
  row: { flexDirection: "row", gap: Spacing.two },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  bold: { fontWeight: "600" },
})
