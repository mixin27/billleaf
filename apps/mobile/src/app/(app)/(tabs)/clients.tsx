import type { Client, ProjectStatus } from "@workspace/contracts"
import { router, Stack } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { useMiniPlayerInset } from "@/components/nav/mini-player"
import { ProjectRow } from "@/components/project-row"
import {
  AppBar,
  Avatar,
  Chip,
  EmptyState,
  ErrorState,
  initialsOf,
  ListGroup,
  ListItem,
  RefreshControl,
  SearchField,
  SegmentedControl,
  SkeletonRows,
  Text,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import { useClients } from "@/features/clients"
import { useDashboard } from "@/features/dashboard"
import { useMe } from "@/features/me"
import { useProjects } from "@/features/projects"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { useWorkPane as usePane, type WorkPane } from "@/stores/panes"

/** Waits until typing pauses, so a search isn't a request per key. */
function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = React.useState(value)
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

type Pane = WorkPane

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
  return <WorkView />
}

/** Clients and projects. `stacked`: pushed from More or Home, with a back button. */
export function WorkView({ stacked }: { stacked?: boolean }) {
  const playerInset = useMiniPlayerInset()
  const t = useTheme()
  const me = useMe()
  const canClients = me.data?.permissions.includes("client.read") ?? false
  const canProjects = me.data?.permissions.includes("project.read") ?? false
  const { pane: picked, setPane: setPicked } = usePane()
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
  const viewTitle = view === "clients" ? "Clients" : "Projects"

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      {stacked ? (
        <Stack.Screen options={{ title: viewTitle }} />
      ) : (
        <AppBar title={viewTitle} />
      )}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[8] + playerInset },
        ]}
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
        {canClients && canProjects ? (
          <SegmentedControl
            options={[
              { value: "clients", label: "Clients" },
              { value: "projects", label: "Projects" },
            ]}
            value={view}
            onChange={setPicked}
          />
        ) : null}
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder={view === "clients" ? "Name or email" : "Project name"}
        />
        {view === "projects" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.bleed}
            contentContainerStyle={styles.chips}
          >
            {PROJECT_FILTERS.map((f) => (
              <Chip
                key={f.value}
                label={f.label}
                selected={status === f.value}
                onPress={() => setStatus(f.value)}
              />
            ))}
          </ScrollView>
        ) : null}

        {list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : !list.data ? (
          <SkeletonRows rows={5} />
        ) : list.data.items.length === 0 ? (
          q ? (
            <EmptyState
              icon="search"
              title="No matches"
              body={`No ${noun} match “${q}”.`}
            />
          ) : view === "clients" ? (
            <EmptyState
              icon="people"
              title="No clients yet"
              body="No clients yet. Add one on the web."
            />
          ) : (
            <EmptyState
              icon="folder"
              title={
                status === "active"
                  ? "No active projects"
                  : `No ${PROJECT_FILTERS.find((f) => f.value === status)!.label.toLowerCase()} projects`
              }
              body={
                status === "active"
                  ? "No active projects. Add one on the web."
                  : `No ${PROJECT_FILTERS.find((f) => f.value === status)!.label.toLowerCase()} projects.`
              }
            />
          )
        ) : (
          <ListGroup>
            {view === "clients"
              ? clients.data?.items.map((c) => (
                  <ClientRow key={c.id} client={c} />
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
          </ListGroup>
        )}
        {list.data && list.data.total > list.data.items.length ? (
          <Text variant="caption" tone="muted" style={styles.center}>
            {`Showing ${list.data.items.length} of ${list.data.total}. Search to find the rest.`}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  )
}

function ClientRow({ client: c }: { client: Client }) {
  const place = [c.city, c.country].filter(Boolean).join(", ")
  const sub = c.email ?? (place || null)
  return (
    <ListItem
      title={c.name}
      subtitle={sub ?? undefined}
      leading={<Avatar label={initialsOf(c.name)} size={40} round />}
      chevron
      accessibilityLabel={[c.name, sub].filter(Boolean).join(", ")}
      onPress={() =>
        router.push({ pathname: "/client/[id]", params: { id: c.id } })
      }
    />
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Space[4],
    paddingTop: Space[2],
    gap: Space[3],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  bleed: { marginHorizontal: -Space[4], flexGrow: 0 },
  chips: { gap: Space[2], paddingHorizontal: Space[4] },
  center: { textAlign: "center" },
})
