import { formatMoney, type QuoteSummary } from "@workspace/contracts"
import { router } from "expo-router"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { Spacing, Type } from "@/constants/theme"
import { QUOTE_STATUS_LABELS, quoteDisplay } from "@/features/quotes"
import { useTheme } from "@/hooks/use-theme"
import { shortDate } from "@/lib/format"

/**
 * One quote in a list: client (or number, with `byNumber`), total and
 * status, with when it expires while it's waiting. Opens the quote.
 */
export function QuoteRow({
  quote: q,
  locale,
  today,
  first,
  byNumber,
}: {
  quote: QuoteSummary
  locale: string
  today: string | undefined
  first: boolean
  byNumber?: boolean
}) {
  const t = useTheme()
  const display = quoteDisplay(q)
  const amount = formatMoney({ amount: q.total, currency: q.currency }, locale)
  const when =
    q.status === "sent" && q.validUntil
      ? `${q.isExpired ? "Expired" : "Valid until"} ${shortDate(q.validUntil, locale, today)}`
      : shortDate(q.issueDate, locale, today)
  const number = q.number ?? "Draft"
  const heading = byNumber ? number : q.clientName
  const sub = (byNumber ? [q.title, when] : [number, when])
    .filter(Boolean)
    .join(" · ")
  const status = QUOTE_STATUS_LABELS[display]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${heading}, ${amount}, ${status}, ${sub}`}
      onPress={() =>
        router.push({ pathname: "/quote/[id]", params: { id: q.id } })
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
                display === "accepted"
                  ? t.primary
                  : display === "expired" || display === "declined"
                    ? t.danger
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
