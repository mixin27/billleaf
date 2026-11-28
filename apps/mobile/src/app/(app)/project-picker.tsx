import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native"

import {
  ErrorState,
  Icon,
  IconTile,
  KeyboardAvoid,
  ListGroup,
  ListItem,
  SearchField,
  SectionHeader,
  SheetHeader,
  SkeletonRows,
  Text,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import {
  useActiveProjects,
  useRunningTimer,
  useTimeSuggestions,
  useUpdateRunning,
} from "@/features/time"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import {
  type DraftProject,
  NO_PROJECT,
  useEditDraft,
  useTimerDraft,
} from "@/stores/timer-draft"

type Row =
  | { kind: "none" }
  | {
      kind: "recent"
      key: string
      description: string
      project: DraftProject
    }
  | { kind: "project"; key: string; project: DraftProject }

/**
 * Pick a project: recent entries (description + project) first, then
 * active projects. Changes the running timer or the next one; with
 * `?for=edit`, the entry being edited (applied when it's saved).
 */
export default function ProjectPickerScreen() {
  const t = useTheme()
  const [query, setQuery] = React.useState("")
  const [q, setQ] = React.useState("")
  React.useEffect(() => {
    const id = setTimeout(() => setQ(query.trim()), 250)
    return () => clearTimeout(id)
  }, [query])
  const editing = useLocalSearchParams<{ for?: string; current?: string }>()
  const forEdit = editing.for === "edit"
  const edit = useEditDraft()
  const running = useRunningTimer()
  const update = useUpdateRunning()
  const draft = useTimerDraft()
  const suggestions = useTimeSuggestions(q)
  const projects = useActiveProjects(q)
  const entry = forEdit ? null : (running.data ?? null)
  const current = forEdit
    ? (edit.project?.projectId ?? editing.current ?? null)
    : (entry?.projectId ?? draft.project.projectId)

  const choose = (project: DraftProject, description?: string) => {
    if (forEdit) {
      // Only the project: the description stays what's in the sheet.
      edit.setProject(project)
      router.back()
    } else if (entry) {
      update.mutate(
        {
          projectId: project.projectId,
          taskId: project.taskId,
          ...(description !== undefined ? { description } : {}),
        },
        {
          onSuccess: () => router.back(),
          onError: (e) => toast.error(errorMessage(e)),
        }
      )
    } else {
      draft.setProject(project)
      if (description !== undefined) draft.setDescription(description)
      router.back()
    }
  }

  const recent: Row[] = (suggestions.data ?? []).slice(0, 5).map((s) => ({
    kind: "recent",
    key: `${s.description}|${s.projectId}|${s.taskId}`,
    description: s.description,
    project: {
      projectId: s.projectId,
      taskId: s.taskId,
      projectName: s.projectName,
      clientName: s.clientName,
      taskTitle: s.taskTitle,
    },
  }))
  const list: Row[] = (projects.data ?? []).map((p) => ({
    kind: "project",
    key: p.id,
    project: {
      projectId: p.id,
      taskId: null,
      projectName: p.name,
      clientName: p.clientName,
      taskTitle: null,
    },
  }))
  const sections = [
    // Recent rows carry a description too; editing an entry takes only
    // the project, so they'd mislead there.
    ...(recent.length && !forEdit ? [{ title: "Recent", data: recent }] : []),
    {
      title: "Projects",
      data: [...(q ? [] : [{ kind: "none" } as Row]), ...list],
    },
  ]

  const rowFor = (item: Row, i: number) => {
    const selected =
      item.kind === "none"
        ? !current
        : item.kind === "project" && item.project.projectId === current
    const title =
      item.kind === "none"
        ? "No project"
        : item.kind === "recent"
          ? item.description || item.project.projectName || "Untitled"
          : item.project.projectName
    const sub =
      item.kind === "none"
        ? "Time that isn't for a project"
        : item.kind === "recent"
          ? [item.project.projectName, item.project.taskTitle]
              .filter(Boolean)
              .join(": ") || undefined
          : (item.project.clientName ?? undefined)
    return (
      <ListItem
        key={item.kind === "none" ? `none-${i}` : item.key}
        title={title ?? "Untitled"}
        subtitle={sub}
        leading={
          <IconTile
            icon={item.kind === "recent" ? "clock" : "folder"}
            tone={selected ? "primary" : "neutral"}
            size={32}
          />
        }
        trailing={
          selected ? <Icon name="check" size={20} tone="primary" /> : null
        }
        selected={selected}
        onPress={
          update.isPending
            ? undefined
            : () =>
                item.kind === "none"
                  ? choose(NO_PROJECT)
                  : item.kind === "recent"
                    ? choose(item.project, item.description)
                    : choose(item.project)
        }
      />
    )
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader
        title="Project"
        onClose={() => router.back()}
        trailing={
          update.isPending ? <ActivityIndicator color={t.primary} /> : null
        }
      />
      <KeyboardAvoid>
        <View style={styles.search}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search projects or recent work"
          />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {sections.map((section) => (
            <View key={section.title}>
              <SectionHeader title={section.title} />
              {section.data.length > 0 ? (
                <ListGroup>{section.data.map(rowFor)}</ListGroup>
              ) : null}
              {section.title === "Projects" ? (
                projects.error && !projects.data ? (
                  <ErrorState
                    compact
                    error={projects.error}
                    onRetry={() => void projects.refetch()}
                  />
                ) : !projects.data ? (
                  <SkeletonRows rows={3} />
                ) : !list.length ? (
                  <Text variant="callout" tone="muted" style={styles.empty}>
                    {q ? "No matching projects." : "No active projects yet."}
                  </Text>
                ) : null
              ) : null}
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoid>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: { paddingHorizontal: Space[4], paddingTop: Space[2] },
  content: { padding: Space[4], paddingTop: 0, paddingBottom: Space[8] },
  empty: { paddingTop: Space[2] },
})
