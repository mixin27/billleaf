import { type CashbookEntry, formatMoney } from "@workspace/contracts"
import * as React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { Radius, Spacing, Type } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"
import { timeLabel } from "@/lib/cashbook"

/** A small grey label (payment mode, category). */
export function Tag({ label }: { label: string }) {
  const t = useTheme()
  return (
    <View style={[styles.tag, { backgroundColor: t.backgroundSelected }]}>
      <Text
        style={[styles.tagText, { color: t.textSecondary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

/**
 * One entry as a card, like the CashBook app: mode and category on top,
 * the remark, the amount in green (in) or red (out) with the balance after
 * it, and who added it when.
 */
export function CashbookEntryRow({
  entry: e,
  currency,
  locale,
  selected,
  selecting,
  onPress,
  onLongPress,
}: {
  entry: CashbookEntry
  currency: string
  locale: string
  selected: boolean
  selecting: boolean
  onPress: () => void
  onLongPress: () => void
}) {
  const t = useTheme()
  const money = (n: number) => formatMoney({ amount: n, currency }, locale)
  const amount = money(e.amount)
  const by = e.createdBy ? (e.createdBy.you ? "You" : e.createdBy.name) : null
  const meta = [
    by ? `Entry by ${by}` : null,
    timeLabel(e.entryTime, locale),
    e.edited ? "Edited" : null,
    e.attachments.length
      ? `${e.attachments.length} attachment${e.attachments.length > 1 ? "s" : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const title =
    e.remark || e.contactName || (e.type === "in" ? "Cash in" : "Cash out")
  const sub = e.remark && e.contactName ? e.contactName : null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${e.type === "in" ? "Cash in" : "Cash out"} ${amount}, ${title}, balance ${money(e.balance)}, ${meta}`}
      accessibilityHint={
        selecting
          ? "Selects or clears it"
          : "Opens it. Long press to select several."
      }
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected
            ? t.backgroundSelected
            : t.backgroundElement,
          borderColor: selected ? t.primary : t.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.top}>
        <View style={styles.tags}>
          {selecting ? (
            <View
              style={[
                styles.check,
                {
                  borderColor: selected ? t.primary : t.textSecondary,
                  backgroundColor: selected ? t.primary : "transparent",
                },
              ]}
            >
              {selected ? (
                <Text style={[styles.checkMark, { color: t.onPrimary }]}>
                  ✓
                </Text>
              ) : null}
            </View>
          ) : null}
          {e.modeName ? <Tag label={e.modeName} /> : null}
          {e.categoryName ? <Tag label={e.categoryName} /> : null}
        </View>
        <Text
          style={[
            Type.body,
            styles.amount,
            { color: e.type === "in" ? t.primary : t.danger },
          ]}
        >
          {amount}
        </Text>
      </View>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text style={[Type.body, { color: t.text }]} numberOfLines={2}>
            {title}
          </Text>
          {sub ? (
            <Text
              style={[Type.small, { color: t.textSecondary }]}
              numberOfLines={1}
            >
              {sub}
            </Text>
          ) : null}
        </View>
        <Text style={[Type.small, styles.balance, { color: t.textSecondary }]}>
          Bal {money(e.balance)}
        </Text>
      </View>
      <Text style={[Type.small, { color: t.primary }]} numberOfLines={1}>
        {meta}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.one + 2,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  tags: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.one,
  },
  tag: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    maxWidth: 160,
  },
  tagText: { fontSize: 12, fontWeight: "500" },
  amount: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  balance: { fontVariant: ["tabular-nums"], marginTop: 2 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { fontSize: 12, fontWeight: "700" },
})
