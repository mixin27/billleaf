import type { Client, ProjectStatus } from "@workspace/contracts"
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

import { ProjectRow } from "@/components/project-row"
import { Body, Chip, Field, Screen, Title } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useClients } from "@/features/clients"
import { useDashboard } from "@/features/dashboard"
import { useMe } from "@/features/me"
import { useProjects } from "@/features/projects"
import { useWorkspaceProfile } from "@/features/workspaces"
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

type Pane = "clients" | "projects"

const PROJECT_FILTERS: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
]

/**
 * Your clients and projects, A to Z, with a search. Clients and Projects
 * share the tab (a sixth tab would go under "More" on iPhone); each half
 * shows with its permission. Add and edit them on the web.
 */
export default function ClientsScreen() {
  const t = useTheme()
  const me = useMe()
  const canClients = me.data?.permissions.includes("client.read") ?? false
  const canProjects = me.data?.permissions.includes("project.read") ?? false
  const [picked, setPicked] = React.useState<Pane>("clients")
  const view: Pane = !canClients
    ? "projects"
    : !canProjects
      ? "clients"
      : picked
  const [search, setSearch] = React.useState("")
  const q = useDebounced(search.trim())
  const [status, setStatus] = React.useState<ProjectStatus>("active")
  const clients = useClients(q, view === "clients" && canClients)
  const projects = useProjects(
    { q, status },
    view === "projects" && canProjects
  )
  const today = useDashboard().data?.today
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const [refreshing, setRefreshing] = React.useState(false)
  const list = view === "clients" ? clients : projects
  const noun = view === "clients" ? "clients" : "projects"

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
          <Title>{view === "clients" ? "Clients" : "Projects"}</Title>
          {canClients && canProjects ? (
            <View style={styles.chips}>
              <Chip
                label="Clients"
                selected={view === "clients"}
                onPress={() => setPicked("clients")}
              />
              <Chip
                label="Projects"
                selected={view === "projects"}
                onPress={() => setPicked("projects")}
              />
            </View>
          ) : null}
          <Field
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder={view === "clients" ? "Name or email" : "Project name"}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {view === "projects" ? (
            <View style={styles.chips}>
              {PROJECT_FILTERS.map((f) => (
                <Chip
                  key={f.value}
                  label={f.label}
                  selected={status === f.value}
                  onPress={() => setStatus(f.value)}
                />
              ))}
            </View>
          ) : null}

          {list.error ? (
            <Body>{errorMessage(list.error)}</Body>
          ) : !list.data ? (
            <Body muted>Loading…</Body>
          ) : list.data.items.length === 0 ? (
            <Body muted>
              {q
                ? `No ${noun} match “${q}”.`
                : view === "clients"
                  ? "No clients yet. Add one on the web."
                  : status === "active"
                    ? "No active projects. Add one on the web."
                    : `No ${PROJECT_FILTERS.find((f) => f.value === status)!.label.toLowerCase()} projects.`}
            </Body>
          ) : (
            <View
              style={[
                styles.card,
                { backgroundColor: t.backgroundElement, borderColor: t.border },
              ]}
            >
              {view === "clients"
                ? clients.data?.items.map((c, i) => (
                    <ClientRow key={c.id} client={c} first={i === 0} />
                  ))
                : projects.data?.items.map((p, i) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      first={i === 0}
                      locale={locale}
                      today={today}
                    />
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  row: { paddingVertical: Spacing.two + 2, gap: Spacing.half },
})
