import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import {
  Amount,
  Avatar,
  EmptyState,
  initialsOf,
  ListGroup,
  ListItem,
  SectionHeader,
  SegmentedControl,
  SheetHeader,
  SkeletonRows,
  Text,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import {
  can,
  useCashbook,
  useCashbooks,
  useTransferEntries,
} from "@/features/cashbook"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"

/** Move or copy selected entries to another book in the same currency. */
export default function CashbookTransferScreen() {
  const { bookId, entryIds } = useLocalSearchParams<{
    bookId: string
    entryIds: string
  }>()
  const t = useTheme()
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const ids = (entryIds ?? "").split(",").filter(Boolean)
  const from = useCashbook(bookId)
  const books = useCashbooks()
  const transfer = useTransferEntries(bookId)
  const [mode, setMode] = React.useState<"move" | "copy">("move")
  const currency = from.data?.currency
  const targets = (books.data ?? []).filter(
    (b) =>
      b.id !== bookId &&
      b.currency === currency &&
      can.manage(b) &&
      !b.archivedAt
  )
  const n = `${ids.length} ${ids.length === 1 ? "entry" : "entries"}`

  const go = (toBookId: string, name: string) =>
    transfer.mutate(
      { entryIds: ids, toBookId, mode },
      {
        onSuccess: ({ count }) => {
          router.back()
          toast.success(
            `${count} ${count === 1 ? "entry" : "entries"} ${mode === "move" ? "moved" : "copied"} to ${name}`
          )
        },
        onError: (e) => toast.error(errorMessage(e)),
      }
    )

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader
        title={mode === "move" ? `Move ${n}` : `Copy ${n}`}
        onClose={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SegmentedControl
          options={[
            { value: "move", label: "Move" },
            { value: "copy", label: "Copy" },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Text variant="callout" tone="muted">
          {mode === "move"
            ? "They leave this book and join the one you pick."
            : "New entries in the book you pick, added by you. These stay."}
        </Text>
        <View>
          <SectionHeader title={`To a ${currency ?? ""} book`} />
          {books.isPending ? (
            <SkeletonRows rows={2} />
          ) : targets.length === 0 ? (
            <EmptyState
              icon="book"
              title="No book to send them to"
              body={`You need another ${currency ?? ""} book where you're an admin.`}
            />
          ) : (
            <ListGroup>
              {targets.map((b) => (
                <ListItem
                  key={b.id}
                  title={b.name}
                  leading={<Avatar label={initialsOf(b.name)} size={40} />}
                  trailing={
                    <Amount
                      value={b.balance}
                      currency={b.currency}
                      locale={locale}
                      sign="auto"
                      size="s"
                    />
                  }
                  chevron
                  onPress={
                    transfer.isPending ? undefined : () => go(b.id, b.name)
                  }
                />
              ))}
            </ListGroup>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space[4], gap: Space[4], paddingBottom: Space[8] },
})
