import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Button, KeyboardAvoid, Screen, Title } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
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
          onError: (e) => Alert.alert("Couldn't change it", errorMessage(e)),
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

  return (
    <Screen>
      {/* An iOS sheet leaves room at the top; Android shows it full screen. */}
      <SafeAreaView
        style={styles.flex}
        edges={Platform.OS === "android" ? ["top", "bottom"] : ["bottom"]}
      >
        <KeyboardAvoid>
          <View style={styles.header}>
            <Title>Project</Title>
            <Button title="Done" variant="link" onPress={() => router.back()} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search projects or recent work"
            placeholderTextColor={t.textSecondary}
            accessibilityLabel="Search projects"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[
              styles.search,
              {
                color: t.text,
                backgroundColor: t.backgroundElement,
                borderColor: t.border,
              },
            ]}
          />
          {update.isPending ? <ActivityIndicator style={styles.busy} /> : null}
          <SectionList
            sections={sections}
            keyExtractor={(r, i) => (r.kind === "none" ? `none-${i}` : r.key)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text
                style={[Type.small, styles.section, { color: t.textSecondary }]}
              >
                {section.title.toUpperCase()}
              </Text>
            )}
            renderItem={({ item }) => {
              const selected =
                item.kind === "none"
                  ? !current
                  : item.kind === "project" &&
                    item.project.projectId === current
              const title =
                item.kind === "none"
                  ? "No project"
                  : item.kind === "recent"
                    ? item.description || item.project.projectName || "Untitled"
                    : item.project.projectName
              const sub =
                item.kind === "none"
                  ? null
                  : item.kind === "recent"
                    ? [item.project.projectName, item.project.taskTitle]
                        .filter(Boolean)
                        .join(": ") || null
                    : item.project.clientName
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  disabled={update.isPending}
                  onPress={() =>
                    item.kind === "none"
                      ? choose(NO_PROJECT)
                      : item.kind === "recent"
                        ? choose(item.project, item.description)
                        : choose(item.project)
                  }
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: selected
                        ? t.backgroundSelected
                        : "transparent",
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <View style={styles.flex}>
                    <Text
                      style={[Type.body, { color: t.text }]}
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                    {sub ? (
                      <Text
                        style={[
                          Type.small,
                          {
                            color:
                              item.kind === "recent"
                                ? t.primary
                                : t.textSecondary,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {sub}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? (
                    <Text style={[Type.body, { color: t.primary }]}>✓</Text>
                  ) : null}
                </Pressable>
              )
            }}
            renderSectionFooter={({ section }) =>
              section.title !== "Projects" ? null : projects.error ? (
                <Text style={[Type.body, styles.empty, { color: t.danger }]}>
                  {errorMessage(projects.error)}
                </Text>
              ) : !projects.isPending && !list.length ? (
                <Text
                  style={[Type.body, styles.empty, { color: t.textSecondary }]}
                >
                  {q ? "No matching projects." : "No active projects yet."}
                </Text>
              ) : null
            }
          />
        </KeyboardAvoid>
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
  search: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
  busy: { marginTop: Spacing.two },
  list: { padding: Spacing.three, paddingBottom: Spacing.five },
  section: {
    fontWeight: "600",
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
  },
  empty: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
})
