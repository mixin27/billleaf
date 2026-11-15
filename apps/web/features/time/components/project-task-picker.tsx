"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { Field } from "@/components/form/field"
import { useProjects, useTasks } from "@/features/projects"

const NO_TASK = "__none__"

/** Active project (required) + one of its open tasks (optional). */
export function ProjectTaskPicker({
  projectId,
  taskId,
  onChange,
}: {
  projectId: string | null
  taskId: string | null
  onChange: (v: { projectId: string | null; taskId: string | null }) => void
}) {
  const projects = useProjects({ status: "active", pageSize: 100 })
  const options = projects.data?.items ?? []
  const tasks = useTasks(projectId ?? "")
  const openTasks = projectId
    ? (tasks.data ?? []).filter((t) => t.status !== "done" || t.id === taskId)
    : []

  return (
    <>
      <Field label="Project" htmlFor="time-project">
        <Select
          items={Object.fromEntries(
            options.map((p) => [
              p.id,
              p.clientName ? `${p.name} · ${p.clientName}` : p.name,
            ])
          )}
          value={projectId}
          onValueChange={(v) =>
            onChange({ projectId: v ? String(v) : null, taskId: null })
          }
        >
          <SelectTrigger id="time-project" className="w-full">
            <SelectValue
              placeholder={
                options.length ? "Choose project" : "No active projects"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {options.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {p.clientName ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {p.clientName}
                  </span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Task" htmlFor="time-task" hint="Optional">
        <Select
          items={{
            [NO_TASK]: "No task",
            ...Object.fromEntries(openTasks.map((t) => [t.id, t.title])),
          }}
          value={taskId ?? NO_TASK}
          disabled={!projectId}
          onValueChange={(v) =>
            onChange({
              projectId,
              taskId: v && v !== NO_TASK ? String(v) : null,
            })
          }
        >
          <SelectTrigger id="time-task" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TASK}>No task</SelectItem>
            {openTasks.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  )
}
