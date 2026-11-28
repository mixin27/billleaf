import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import {
  Button,
  Chip,
  DateField,
  SegmentedControl,
  SheetFooter,
  SheetHeader,
  Text,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import {
  type BookFilters,
  useBookFilters,
  useCashbook,
  useCashbookMembers,
  useCashbookOptions,
  useFiltersFor,
} from "@/features/cashbook"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { DURATIONS, nowIn } from "@/lib/cashbook"

type TypeFilter = "all" | "in" | "out"

/** All of a book's filters on one sheet; Apply puts them on the book. */
export default function BookFiltersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const profile = useWorkspaceProfile()
  const locale =
    profile.data?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const today = nowIn(profile.data?.timezone).date
  const current = useFiltersFor(id)
  const setFilters = useBookFilters((s) => s.set)
  const book = useCashbook(id)
  const categories = useCashbookOptions(id, "categories")
  const modes = useCashbookOptions(id, "modes")
  const members = useCashbookMembers(id)
  const [f, setF] = React.useState<BookFilters>(current)
  const patch = (p: Partial<BookFilters>) => setF((x) => ({ ...x, ...p }))
  const fields = book.data?.fields
  const backwards = Boolean(
    f.duration === "custom" && f.from && f.to && f.from > f.to
  )

  const group = (
    label: string,
    items: { id: string; name: string }[] | undefined,
    value: string | undefined,
    set: (v: string | undefined) => void
  ) =>
    items && items.length ? (
      <View style={styles.group}>
        <Text variant="label" tone="muted">
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
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader title="Filters" onClose={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.group}>
          <Text variant="label" tone="muted">
            Dates
          </Text>
          <View style={styles.wrap}>
            {[...DURATIONS, { value: "custom" as const, label: "Custom" }].map(
              (d) => (
                <Chip
                  key={d.value}
                  label={d.label}
                  selected={f.duration === d.value}
                  onPress={() => patch({ duration: d.value })}
                />
              )
            )}
          </View>
          {f.duration === "custom" ? (
            <View style={styles.row}>
              <View style={styles.flex}>
                <DateField
                  label="From"
                  value={f.from ?? null}
                  onChange={(v) => patch({ from: v ?? undefined })}
                  today={today}
                  locale={locale}
                  optional
                />
              </View>
              <View style={styles.flex}>
                <DateField
                  label="To"
                  value={f.to ?? null}
                  onChange={(v) => patch({ to: v ?? undefined })}
                  today={today}
                  locale={locale}
                  optional
                />
              </View>
            </View>
          ) : null}
          {backwards ? (
            <Text variant="caption" tone="out">
              “From” is after “To”.
            </Text>
          ) : null}
        </View>

        <View style={styles.group}>
          <Text variant="label" tone="muted">
            Entry type
          </Text>
          <SegmentedControl<TypeFilter>
            options={[
              { value: "all", label: "All" },
              { value: "in", label: "Cash in" },
              { value: "out", label: "Cash out" },
            ]}
            value={f.type ?? "all"}
            onChange={(v) => patch({ type: v === "all" ? undefined : v })}
            tones={{ in: "in", out: "out" }}
          />
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
      </ScrollView>
      <SheetFooter>
        <Button
          title="Clear all"
          variant="secondary"
          onPress={() => {
            useBookFilters.getState().reset(id)
            router.back()
          }}
        />
        <Button
          title="Apply"
          disabled={backwards}
          onPress={() => {
            setFilters(id, f)
            router.back()
          }}
        />
      </SheetFooter>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space[4], gap: Space[5], paddingBottom: Space[8] },
  group: { gap: Space[2] },
  row: { flexDirection: "row", gap: Space[3] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Space[2] },
})
