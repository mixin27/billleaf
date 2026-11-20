import type { LineItem } from "@workspace/contracts"
import type * as React from "react"
import { StyleSheet, Text, View } from "react-native"

import { Body } from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"

/**
 * A document's lines (quantity × price, tax) and, under a rule, its
 * totals: pass `Total` rows as children. Goes inside a `Section`.
 */
export function LineItems({
  lines,
  money,
  children,
}: {
  lines: LineItem[]
  money: (n: number) => string
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <>
      {lines.length === 0 ? (
        <Body muted style={styles.empty}>
          No items.
        </Body>
      ) : (
        lines.map((l, i) => (
          <View
            key={l.id}
            style={[
              styles.line,
              i > 0 && { borderTopWidth: 1, borderTopColor: t.border },
            ]}
          >
            <View style={styles.flex}>
              <Text style={[Type.body, { color: t.text }]}>
                {l.description}
              </Text>
              <Text style={[Type.small, { color: t.textSecondary }]}>
                {`${l.quantity} × ${money(l.unitPrice)}`}
                {l.taxRateBps ? ` · tax ${l.taxRateBps / 100}%` : ""}
              </Text>
            </View>
            <Text style={[Type.body, styles.num, { color: t.text }]}>
              {money(l.amount)}
            </Text>
          </View>
        ))
      )}
      <View style={[styles.totals, { borderTopColor: t.border }]}>
        {children}
      </View>
    </>
  )
}

/** One totals row: label on the left, amount on the right. */
export function Total({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  const t = useTheme()
  const weight = bold ? styles.bold : null
  return (
    <View style={styles.total} accessible>
      <Text style={[Type.body, weight, { color: t.textSecondary }]}>
        {label}
      </Text>
      <Text style={[Type.body, styles.num, weight, { color: t.text }]}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { paddingVertical: Spacing.two + 2 },
  line: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  num: { fontVariant: ["tabular-nums"] },
  bold: { fontWeight: "700" },
  totals: {
    borderTopWidth: 1,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  total: { flexDirection: "row", justifyContent: "space-between" },
})
