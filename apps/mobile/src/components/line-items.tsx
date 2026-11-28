import type { LineItem } from "@workspace/contracts"
import type * as React from "react"
import { StyleSheet, View } from "react-native"

import { ListGroup, ListItem, Text } from "@/components/ui"
import { Space } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"

/**
 * A document's lines (quantity × price, tax) and, under a rule, its
 * totals: pass `Total` rows as children. Draws its own `ListGroup`; put a
 * `SectionHeader` above it.
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
    <ListGroup>
      {lines.length === 0 ? (
        <ListItem
          title={
            <Text variant="callout" tone="muted">
              No items.
            </Text>
          }
        />
      ) : (
        lines.map((l) => {
          const detail = `${l.quantity} × ${money(l.unitPrice)}${l.taxRateBps ? ` · tax ${l.taxRateBps / 100}%` : ""}`
          return (
            <ListItem
              key={l.id}
              title={
                <Text variant="body" selectable>
                  {l.description}
                </Text>
              }
              subtitle={
                <Text variant="callout" tone="muted" numeric>
                  {detail}
                </Text>
              }
              trailing={
                <Text variant="bodyStrong" numeric>
                  {money(l.amount)}
                </Text>
              }
              accessibilityLabel={`${l.description}, ${detail}, ${money(l.amount)}`}
            />
          )
        })
      )}
      <View style={[styles.totals, { backgroundColor: t.surfaceMuted }]}>
        {children}
      </View>
    </ListGroup>
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
  return (
    <View
      style={styles.total}
      accessible
      accessibilityLabel={`${label}, ${value}`}
    >
      <Text
        variant={bold ? "bodyStrong" : "callout"}
        tone={bold ? "default" : "muted"}
        style={styles.label}
      >
        {label}
      </Text>
      <Text variant={bold ? "bodyStrong" : "label"} numeric>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  totals: {
    paddingHorizontal: Space[4] - 2,
    paddingVertical: Space[3],
    gap: Space[1],
  },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: Space[3],
  },
  label: { flexShrink: 1 },
})
