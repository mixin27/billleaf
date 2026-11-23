import type { ContractSummary } from "@workspace/contracts"
import { router } from "expo-router"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { Spacing, Type } from "@/constants/theme"
import { CONTRACT_STATUS_LABELS, contractTone } from "@/features/contracts"
import { useTheme } from "@/hooks/use-theme"
import { shortDate } from "@/lib/format"

/**
 * One contract in a list: client (or title, with `byTitle`), number and
 * the date that matters for its state. Opens the contract.
 */
export function ContractRow({
  contract: c,
  locale,
  today,
  first,
  byTitle,
}: {
  contract: ContractSummary
  locale: string
  today: string | undefined
  first: boolean
  byTitle?: boolean
}) {
  const t = useTheme()
  const tone = contractTone(c.status)
  const date = (iso: string) => shortDate(iso.slice(0, 10), locale, today)
  const when =
    c.status === "signed" && c.signedAt
      ? `Signed ${date(c.signedAt)}`
      : c.status === "sent" && c.sentAt
        ? `Sent ${date(c.sentAt)}`
        : date(c.createdAt)
  const number = c.number ?? "Draft"
  const heading = byTitle ? (c.title ?? number) : c.clientName
  const sub = (byTitle ? [number, when] : [c.title ?? number, when])
    .filter(Boolean)
    .join(" · ")
  const status = CONTRACT_STATUS_LABELS[c.status]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${heading}, ${status}, ${sub}`}
      onPress={() =>
        router.push({ pathname: "/contract/[id]", params: { id: c.id } })
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
      <Text
        style={[
          Type.small,
          {
            color:
              tone === "good"
                ? t.primary
                : tone === "bad"
                  ? t.danger
                  : t.textSecondary,
          },
        ]}
      >
        {status}
      </Text>
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
})
