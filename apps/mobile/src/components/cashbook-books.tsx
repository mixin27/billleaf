import { type Cashbook, formatMoney } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { Body, Button, Chip } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useCashbooks } from "@/features/cashbook"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"

/** "2h ago", "3d ago", "just now". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "No entries yet"
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 60) return "Updated just now"
  if (s < 3600) return `Updated ${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `Updated ${Math.floor(s / 3600)}h ago`
  if (s < 30 * 86_400) return `Updated ${Math.floor(s / 86_400)}d ago`
  return `Updated ${Math.floor(s / (30 * 86_400))}mo ago`
}

/** Your books, most recently used first, and the way to add one. */
export function CashbookBooks({
  locale,
  canCreate,
}: {
  locale: string
  canCreate: boolean
}) {
  const t = useTheme()
  const [archived, setArchived] = React.useState(false)
  const books = useCashbooks({ archived })

  return (
    <View style={styles.gap}>
      {canCreate && !archived ? (
        <Button
          title="+ Add new book"
          onPress={() => router.push("/book-new")}
        />
      ) : null}
      <View style={styles.row}>
        <Text style={[Type.small, styles.heading, { color: t.textSecondary }]}>
          {archived ? "ARCHIVED BOOKS" : "YOUR BOOKS"}
        </Text>
        <Chip
          label={archived ? "Show active" : "Archived"}
          selected={archived}
          onPress={() => setArchived(!archived)}
        />
      </View>
      {books.error ? (
        <Body>{errorMessage(books.error)}</Body>
      ) : !books.data ? (
        <Body muted>Loading…</Body>
      ) : books.data.length === 0 ? (
        <Body muted>
          {archived
            ? "No archived books."
            : canCreate
              ? "Add a book for each thing you track, like your shop or home. Record cash in and cash out, and see the balance."
              : "You haven't been added to any cashbook yet."}
        </Body>
      ) : (
        books.data.map((b) => <BookCard key={b.id} book={b} locale={locale} />)
      )}
    </View>
  )
}

function BookCard({ book: b, locale }: { book: Cashbook; locale: string }) {
  const t = useTheme()
  const balance = formatMoney(
    { amount: b.balance, currency: b.currency },
    locale
  )
  const sub = [
    ago(b.lastActivityAt),
    b.memberCount > 1 ? `${b.memberCount} members` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${b.name}, balance ${balance}, ${sub}`}
      onPress={() =>
        router.push({ pathname: "/book/[id]", params: { id: b.id } })
      }
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.backgroundElement,
          borderColor: t.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <Text
          style={[Type.body, styles.name, { color: t.text }]}
          numberOfLines={1}
        >
          {b.name}
        </Text>
        <Text
          style={[
            Type.body,
            styles.amount,
            { color: b.balance < 0 ? t.danger : t.primary },
          ]}
        >
          {balance}
        </Text>
      </View>
      <View style={styles.cardTop}>
        <Text
          style={[Type.small, { color: t.textSecondary }]}
          numberOfLines={1}
        >
          {sub}
        </Text>
        <Text style={[Type.small, { color: t.textSecondary }]}>
          {b.role === "owner" ? b.currency : `${b.currency} · ${b.role}`}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.three },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.two,
  },
  heading: { fontWeight: "600" },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  name: { flex: 1, fontWeight: "600" },
  amount: { fontWeight: "700", fontVariant: ["tabular-nums"] },
})
