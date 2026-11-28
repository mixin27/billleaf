import type { Cashbook } from "@workspace/contracts"
import * as React from "react"
import { StyleSheet, View } from "react-native"

import {
  Amount,
  Avatar,
  EmptyState,
  ErrorState,
  initialsOf,
  ListGroup,
  ListItem,
  SearchField,
  SectionHeader,
  SkeletonRows,
  Text,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import { useCashbooks } from "@/features/cashbook"
import { signedAmount } from "@/lib/money-display"

/** "Updated 2h ago", "Updated just now", "No entries yet". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "No entries yet"
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 60) return "Updated just now"
  if (s < 3600) return `Updated ${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `Updated ${Math.floor(s / 3600)}h ago`
  if (s < 30 * 86_400) return `Updated ${Math.floor(s / 86_400)}d ago`
  return `Updated ${Math.floor(s / (30 * 86_400))}mo ago`
}

/** Search shows once there are more books than this. */
const SEARCH_FROM = 5

/**
 * Your books, most recently used first: name, when it last changed, who
 * else is in it, and its balance. Archived books are one tap away.
 * `selectedId` marks the open one (the tablet split view).
 */
export function BooksList({
  locale,
  canCreate,
  selectedId,
  onOpen,
  onAdd,
}: {
  locale: string
  canCreate: boolean
  selectedId?: string | null
  onOpen: (book: Cashbook) => void
  onAdd: () => void
}) {
  const [archived, setArchived] = React.useState(false)
  const [q, setQ] = React.useState("")
  const books = useCashbooks({ archived })
  const all = books.data ?? []
  const shown = q.trim()
    ? all.filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()))
    : all

  return (
    <View style={styles.gap}>
      {all.length > SEARCH_FROM || q ? (
        <SearchField value={q} onChangeText={setQ} placeholder="Search books" />
      ) : null}
      <SectionHeader
        title={archived ? "Archived books" : "Your books"}
        action={{
          label: archived ? "Show active" : "Show archived",
          onPress: () => setArchived(!archived),
        }}
      />
      {books.error && !books.data ? (
        <ErrorState
          compact
          error={books.error}
          onRetry={() => void books.refetch()}
        />
      ) : !books.data ? (
        <SkeletonRows rows={3} />
      ) : shown.length === 0 ? (
        archived ? (
          <EmptyState
            icon="book"
            title="No archived books"
            body="Books you archive move here, with their entries kept."
          />
        ) : q ? (
          <Text variant="callout" tone="muted">
            No books match “{q.trim()}”.
          </Text>
        ) : (
          <EmptyState
            icon="book"
            title="No books yet"
            body={
              canCreate
                ? "Add a book for each thing you track, like your shop or home: cash in, cash out, and the balance."
                : "You haven't been added to a cashbook yet."
            }
            action={
              canCreate
                ? { label: "Add book", icon: "plus", onPress: onAdd }
                : undefined
            }
          />
        )
      ) : (
        <ListGroup>
          {shown.map((b) => (
            <BookRow
              key={b.id}
              book={b}
              locale={locale}
              selected={b.id === selectedId}
              onPress={() => onOpen(b)}
            />
          ))}
        </ListGroup>
      )}
    </View>
  )
}

function BookRow({
  book: b,
  locale,
  selected,
  onPress,
}: {
  book: Cashbook
  locale: string
  selected: boolean
  onPress: () => void
}) {
  const sub = [
    ago(b.lastActivityAt),
    b.memberCount > 1 ? `${b.memberCount} members` : null,
    b.role === "owner" ? null : b.role,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <ListItem
      title={b.name}
      subtitle={sub}
      leading={<Avatar label={initialsOf(b.name)} size={40} />}
      trailing={
        <>
          <Amount
            value={b.balance}
            currency={b.currency}
            locale={locale}
            sign="auto"
          />
          <Text variant="caption" tone="subtle">
            {b.currency}
          </Text>
        </>
      }
      selected={selected || undefined}
      onPress={onPress}
      accessibilityLabel={`${b.name}, balance ${signedAmount(b.balance, b.currency, locale, "auto").text} ${b.currency}, ${sub}`}
    />
  )
}

const styles = StyleSheet.create({
  gap: { gap: Space[1] },
})
