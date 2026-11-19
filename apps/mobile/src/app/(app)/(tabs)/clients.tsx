import type { Client } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Body, Field, Screen, Title } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useClients } from "@/features/clients"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"

/** Waits until typing pauses, so a search isn't a request per key. */
function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = React.useState(value)
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/** Your active clients, A to Z, with a search. Add and edit them on the web. */
export default function ClientsScreen() {
  const t = useTheme()
  const [search, setSearch] = React.useState("")
  const q = useDebounced(search.trim())
  const list = useClients(q)
  const [refreshing, setRefreshing] = React.useState(false)
  const items = list.data?.items

  return (
    <Screen>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true)
                await list.refetch()
                setRefreshing(false)
              }}
            />
          }
        >
          <Title>Clients</Title>
          <Field
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder="Name or email"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />

          {list.error ? (
            <Body>{errorMessage(list.error)}</Body>
          ) : !items ? (
            <Body muted>Loading…</Body>
          ) : items.length === 0 ? (
            <Body muted>
              {q
                ? `No clients match “${q}”.`
                : "No clients yet. Add one on the web."}
            </Body>
          ) : (
            <View
              style={[
                styles.card,
                { backgroundColor: t.backgroundElement, borderColor: t.border },
              ]}
            >
              {items.map((c, i) => (
                <ClientRow key={c.id} client={c} first={i === 0} />
              ))}
            </View>
          )}
          {list.data && list.data.total > list.data.items.length ? (
            <Body muted style={Type.small}>
              {`Showing ${list.data.items.length} of ${list.data.total}. Search to find the rest.`}
            </Body>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  )
}

function ClientRow({ client: c, first }: { client: Client; first: boolean }) {
  const t = useTheme()
  const place = [c.city, c.country].filter(Boolean).join(", ")
  const sub = c.email ?? (place || null)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[c.name, sub].filter(Boolean).join(", ")}
      onPress={() =>
        router.push({ pathname: "/client/[id]", params: { id: c.id } })
      }
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: t.border },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={[Type.body, { color: t.text }]} numberOfLines={1}>
        {c.name}
      </Text>
      {sub ? (
        <Text
          style={[Type.small, { color: t.textSecondary }]}
          numberOfLines={1}
        >
          {sub}
        </Text>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  row: { paddingVertical: Spacing.two + 2, gap: Spacing.half },
})
