import { formatDuration } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"

import { Skeleton, Text } from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { useBooksMonth } from "@/features/dashboard"
import { useCashbooks } from "@/features/cashbook"
import { useTheme } from "@/hooks/use-theme"
import { signedAmount } from "@/lib/money-display"

/**
 * Cash on hand across your books, one currency per page (swipe), with
 * this month's cash in and out. Tap to open Money.
 */
export function WalletCard({
  locale,
  today,
}: {
  locale: string
  today: string | undefined
}) {
  const t = useTheme()
  const books = useCashbooks()
  const month = useBooksMonth(books.data, today)
  const [width, setWidth] = React.useState(0)
  const [page, setPage] = React.useState(0)

  const pages = React.useMemo(() => {
    const by = new Map<string, { balance: number; count: number }>()
    for (const b of books.data ?? []) {
      const cur = by.get(b.currency) ?? { balance: 0, count: 0 }
      cur.balance += b.balance
      cur.count += 1
      by.set(b.currency, cur)
    }
    return [...by.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([currency, v]) => ({ currency, ...v }))
  }, [books.data])

  const fg = t.onPrimary

  if (!books.data)
    return (
      <View style={[styles.card, { backgroundColor: t.primary }]}>
        <Skeleton width={120} height={12} />
        <Skeleton width={200} height={32} />
      </View>
    )

  if (pages.length === 0)
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate("/expenses")}
        style={[styles.card, { backgroundColor: t.primary }]}
      >
        <Text variant="label" style={{ color: fg, opacity: 0.85 }}>
          Cash on hand
        </Text>
        <Text variant="title" style={{ color: fg }}>
          Add your first book
        </Text>
        <Text variant="callout" style={{ color: fg, opacity: 0.85 }}>
          Track cash in and out for your shop, home or a project.
        </Text>
      </Pressable>
    )

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.card, styles.flush, { backgroundColor: t.primary }]}
    >
      <View style={[styles.ring, { borderColor: fg }]} />
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          width && setPage(Math.round(e.nativeEvent.contentOffset.x / width))
        }
      >
        {pages.map((p) => {
          const m = month.byCurrency.get(p.currency)
          const total = signedAmount(p.balance, p.currency, locale, "auto").text
          return (
            <Pressable
              key={p.currency}
              accessibilityRole="button"
              accessibilityLabel={`Cash on hand, ${total} ${p.currency} in ${p.count} ${p.count === 1 ? "book" : "books"}. Opens Money`}
              onPress={() => router.navigate("/expenses")}
              style={[styles.page, { width: width || undefined }]}
            >
              <View style={styles.line}>
                <Text variant="label" style={{ color: fg, opacity: 0.85 }}>
                  {`Cash on hand · ${p.count} ${p.count === 1 ? "book" : "books"}`}
                </Text>
                <Text variant="label" style={{ color: fg, opacity: 0.85 }}>
                  {p.currency}
                </Text>
              </View>
              <Text
                variant="display"
                numeric
                adjustsFontSizeToFit
                numberOfLines={1}
                style={{ color: fg }}
              >
                {total}
              </Text>
              <View style={styles.row}>
                <View>
                  <Text variant="caption" style={{ color: fg, opacity: 0.85 }}>
                    In this month
                  </Text>
                  <Text variant="bodyStrong" numeric style={{ color: fg }}>
                    {m
                      ? signedAmount(m.totalIn, p.currency, locale, "in").text
                      : "…"}
                  </Text>
                </View>
                <View>
                  <Text variant="caption" style={{ color: fg, opacity: 0.85 }}>
                    Out this month
                  </Text>
                  <Text variant="bodyStrong" numeric style={{ color: fg }}>
                    {m
                      ? signedAmount(m.totalOut, p.currency, locale, "out").text
                      : "…"}
                  </Text>
                </View>
              </View>
            </Pressable>
          )
        })}
      </ScrollView>
      {pages.length > 1 ? (
        <View style={styles.dots}>
          {pages.map((p, i) => (
            <View
              key={p.currency}
              style={[
                styles.dot,
                {
                  backgroundColor: fg,
                  opacity: i === page ? 1 : 0.4,
                  width: i === page ? 16 : 6,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** For a role without cashbooks: tracked time this week in the same place. */
export function TimeWalletCard({
  total,
  billable,
  todaySeconds,
}: {
  total: number | undefined
  billable: number | undefined
  todaySeconds: number | undefined
}) {
  const t = useTheme()
  const fg = t.onPrimary
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tracked this week ${formatDuration(total ?? 0)}. Opens Time`}
      onPress={() => router.navigate("/time")}
      style={[styles.card, { backgroundColor: t.primary }]}
    >
      <View style={[styles.ring, { borderColor: fg }]} />
      <View style={styles.line}>
        <Text variant="label" style={{ color: fg, opacity: 0.85 }}>
          Tracked this week
        </Text>
        <Text variant="label" style={{ color: fg, opacity: 0.85 }}>
          Mon–Sun
        </Text>
      </View>
      <Text variant="display" numeric style={{ color: fg }}>
        {total === undefined ? "…" : formatDuration(total)}
      </Text>
      <View style={styles.row}>
        <View>
          <Text variant="caption" style={{ color: fg, opacity: 0.85 }}>
            Billable
          </Text>
          <Text variant="bodyStrong" numeric style={{ color: fg }}>
            {billable === undefined ? "…" : formatDuration(billable)}
          </Text>
        </View>
        <View>
          <Text variant="caption" style={{ color: fg, opacity: 0.85 }}>
            Today
          </Text>
          <Text variant="bodyStrong" numeric style={{ color: fg }}>
            {todaySeconds === undefined ? "…" : formatDuration(todaySeconds)}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl + 4,
    padding: Space[5],
    gap: Space[1],
    overflow: "hidden",
  },
  flush: { padding: 0, paddingBottom: Space[4] },
  page: { padding: Space[5], paddingBottom: Space[1], gap: Space[1] },
  ring: {
    position: "absolute",
    right: -48,
    top: -48,
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 24,
    opacity: 0.08,
  },
  line: { flexDirection: "row", justifyContent: "space-between" },
  row: { flexDirection: "row", gap: Space[6], marginTop: Space[2] },
  dots: {
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: Space[5],
    paddingTop: Space[2],
  },
  dot: { height: 6, borderRadius: 3 },
})
