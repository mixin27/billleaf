import { formatMoney, type InvoiceSummary } from "@workspace/contracts"
import { router } from "expo-router"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { Spacing, Type } from "@/constants/theme"
import { INVOICE_STATUS_LABELS } from "@/features/invoices"
import { useTheme } from "@/hooks/use-theme"
import { shortDate } from "@/lib/format"

/**
 * One invoice in a list: who (or which number), what's due or the total,
 * and its status. Opens the invoice. `byNumber` leads with the number,
 * for lists that are already one client's.
 */
export function InvoiceRow({
  invoice: inv,
  locale,
  today,
  first,
  byNumber,
}: {
  invoice: InvoiceSummary
  locale: string
  today: string | undefined
  first: boolean
  byNumber?: boolean
}) {
  const t = useTheme()
  const owing = inv.displayStatus !== "paid" && inv.displayStatus !== "void"
  const amount = formatMoney(
    {
      amount: owing && inv.status === "issued" ? inv.amountDue : inv.total,
      currency: inv.currency,
    },
    locale
  )
  const when =
    inv.status === "issued" && owing && inv.dueDate
      ? `Due ${shortDate(inv.dueDate, locale, today)}`
      : shortDate(inv.issueDate, locale, today)
  const number = inv.number ?? "Draft"
  const heading = byNumber ? number : inv.clientName
  const sub = (byNumber ? [inv.title, when] : [number, when])
    .filter(Boolean)
    .join(" · ")
  const status = INVOICE_STATUS_LABELS[inv.displayStatus]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${heading}, ${amount}, ${status}, ${sub}`}
      onPress={() =>
        router.push({ pathname: "/invoice/[id]", params: { id: inv.id } })
      }
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: t.border },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={styles.flex}>
        <Text style={[Type.body, { color: t.text }]} numberOfLines={1}>
          {heading}
        </Text>
        <Text
          style={[Type.small, { color: t.textSecondary }]}
          numberOfLines={1}
        >
          {sub}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[Type.body, styles.amount, { color: t.text }]}>
          {amount}
        </Text>
        <Text
          style={[
            Type.small,
            {
              color:
                inv.displayStatus === "overdue"
                  ? t.danger
                  : inv.displayStatus === "paid"
                    ? t.primary
                    : t.textSecondary,
            },
          ]}
        >
          {status}
        </Text>
      </View>
    </Pressable>
  )
}

/** What's still owed on these invoices, per currency. */
export function totalsByCurrency(items: InvoiceSummary[]) {
  const m = new Map<string, number>()
  for (const i of items)
    m.set(i.currency, (m.get(i.currency) ?? 0) + i.amountDue)
  return [...m].map(([currency, amount]) => ({ currency, amount }))
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  right: { alignItems: "flex-end", gap: Spacing.half },
  amount: { fontWeight: "600", fontVariant: ["tabular-nums"] },
})
