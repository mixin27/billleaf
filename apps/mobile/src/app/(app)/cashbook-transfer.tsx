import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Body, Button, Chip, Screen, Title } from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import {
  can,
  useCashbook,
  useCashbooks,
  useTransferEntries,
} from "@/features/cashbook"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"

/** Move or copy selected entries to another book in the same currency. */
export default function CashbookTransferScreen() {
  const { bookId, entryIds } = useLocalSearchParams<{
    bookId: string
    entryIds: string
  }>()
  const t = useTheme()
  const ids = (entryIds ?? "").split(",").filter(Boolean)
  const from = useCashbook(bookId)
  const books = useCashbooks()
  const transfer = useTransferEntries(bookId)
  const [mode, setMode] = React.useState<"move" | "copy">("move")
  const targets = (books.data ?? []).filter(
    (b) =>
      b.id !== bookId &&
      b.currency === from.data?.currency &&
      can.manage(b) &&
      !b.archivedAt
  )

  const go = (toBookId: string, name: string) =>
    transfer.mutate(
      { entryIds: ids, toBookId, mode },
      {
        onSuccess: ({ count }) => {
          router.back()
          Alert.alert(
            mode === "move" ? "Moved" : "Copied",
            `${count} ${count === 1 ? "entry" : "entries"} ${mode === "move" ? "moved" : "copied"} to ${name}.`
          )
        },
        onError: (e) => Alert.alert("Couldn't do that", errorMessage(e)),
      }
    )

  return (
    <Screen>
      <SafeAreaView
        style={styles.flex}
        edges={Platform.OS === "android" ? ["top", "bottom"] : ["bottom"]}
      >
        <View style={styles.header}>
          <Title>{`${ids.length} ${ids.length === 1 ? "entry" : "entries"}`}</Title>
          <Button title="Cancel" variant="link" onPress={() => router.back()} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.wrap}>
            <Chip
              label="Move"
              selected={mode === "move"}
              onPress={() => setMode("move")}
            />
            <Chip
              label="Copy"
              selected={mode === "copy"}
              onPress={() => setMode("copy")}
            />
          </View>
          <Body muted style={Type.small}>
            {mode === "move"
              ? "Moved entries leave this book and join the other one."
              : "Copies are new entries in the other book, added by you."}
          </Body>
          <Text style={[Type.small, styles.bold, { color: t.textSecondary }]}>
            {`TO A ${from.data?.currency ?? ""} BOOK`}
          </Text>
          {books.isPending ? (
            <Body muted>Loading…</Body>
          ) : targets.length === 0 ? (
            <Body muted>
              No other {from.data?.currency} book where you're an admin.
            </Body>
          ) : (
            targets.map((b) => (
              <Button
                key={b.id}
                title={b.name}
                variant="secondary"
                disabled={transfer.isPending}
                onPress={() => go(b.id, b.name)}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  content: { padding: Spacing.four, gap: Spacing.three },
  wrap: { flexDirection: "row", gap: Spacing.two },
  bold: { fontWeight: "600" },
})
