import type { CashbookEntry } from "@workspace/contracts"
import * as React from "react"
import { Pressable, StyleSheet, View } from "react-native"

import { Amount, Badge, Checkbox, Icon, Text } from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"
import { timeLabel } from "@/lib/cashbook"
import { signedAmount } from "@/lib/money-display"

/**
 * One entry, CashBook style: the remark (or contact) with its payment mode
 * and category, who added it and when; the signed amount on the right
 * with the balance after it. Rows sit flat in a rounded group per day:
 * `first` / `last` round its corners.
 */
export function EntryRow({
  entry: e,
  currency,
  locale,
  first,
  last,
  selecting,
  selected,
  onPress,
  onLongPress,
}: {
  entry: CashbookEntry
  currency: string
  locale: string
  first: boolean
  last: boolean
  selecting: boolean
  selected: boolean
  onPress: () => void
  onLongPress: () => void
}) {
  const t = useTheme()
  const title =
    e.remark || e.contactName || (e.type === "in" ? "Cash in" : "Cash out")
  const contact = e.remark && e.contactName ? e.contactName : null
  const by = e.createdBy ? (e.createdBy.you ? "You" : e.createdBy.name) : null
  const meta = [
    by ? `by ${by}` : null,
    timeLabel(e.entryTime, locale),
    e.edited ? "edited" : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const amount = signedAmount(e.amount, currency, locale, e.type).text
  const balance = signedAmount(e.balance, currency, locale, "auto").text

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selecting ? { selected } : undefined}
      accessibilityLabel={`${e.type === "in" ? "Cash in" : "Cash out"} ${amount}, ${title}${contact ? `, ${contact}` : ""}, balance ${balance}, ${meta}`}
      accessibilityHint={
        selecting ? "Selects or clears it" : "Opens it. Long-press to select"
      }
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected
            ? t.surfaceSelected
            : pressed
              ? t.surfaceMuted
              : t.surface,
          borderColor: t.border,
        },
        first && styles.first,
        last && styles.last,
      ]}
    >
      {!first ? (
        <View style={[styles.divider, { backgroundColor: t.border }]} />
      ) : null}
      {selecting ? <Checkbox checked={selected} /> : null}
      <View style={styles.main}>
        {e.modeName || e.categoryName ? (
          <View style={styles.tags}>
            {e.modeName ? <Badge label={e.modeName} tone="info" /> : null}
            {e.categoryName ? <Badge label={e.categoryName} /> : null}
          </View>
        ) : null}
        <Text variant="bodyStrong" numberOfLines={2}>
          {title}
        </Text>
        {contact ? (
          <Text variant="callout" tone="muted" numberOfLines={1}>
            {contact}
          </Text>
        ) : null}
        <View style={styles.meta}>
          <Text variant="caption" tone="subtle" numberOfLines={1}>
            {meta}
          </Text>
          {e.attachments.length ? (
            <View style={styles.attach}>
              <Icon name="attach" size={13} tone="subtle" />
              <Text variant="caption" tone="subtle">
                {e.attachments.length}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.end}>
        <Amount
          value={e.amount}
          currency={currency}
          locale={locale}
          sign={e.type}
        />
        <Text variant="caption" tone="muted" numeric>
          Bal {balance}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space[3],
    paddingHorizontal: Space[4] - 2,
    paddingVertical: Space[3],
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  first: {
    borderTopWidth: 1,
    borderTopLeftRadius: Radius.lg - 2,
    borderTopRightRadius: Radius.lg - 2,
  },
  last: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: Radius.lg - 2,
    borderBottomRightRadius: Radius.lg - 2,
  },
  divider: {
    position: "absolute",
    top: 0,
    left: Space[4],
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, minWidth: 0, gap: 3 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: Space[1] },
  meta: { flexDirection: "row", alignItems: "center", gap: Space[2] },
  attach: { flexDirection: "row", alignItems: "center", gap: 2 },
  end: { alignItems: "flex-end", gap: 2, flexShrink: 0 },
})
