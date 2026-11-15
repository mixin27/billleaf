"use client"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Folder01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"

import { useProjects, useTasks } from "@/features/projects"

export interface ProjectTarget {
  projectId: string | null
  taskId: string | null
}

/** What a picker shows for an entry (names come from the entry itself). */
export interface ProjectLabel {
  projectName: string | null
  clientName: string | null
  taskTitle: string | null
}

/**
 * Clockify-style project picker: "No project", then active projects grouped
 * by client. Picking a project with open tasks moves to a task step.
 */
export function ProjectPopover({
  value,
  label,
  onChange,
  disabled,
  compact,
  className,
  trigger,
}: {
  value: ProjectTarget
  label: ProjectLabel
  onChange: (target: ProjectTarget, label: ProjectLabel) => void
  disabled?: boolean
  /** Icon-only trigger when no project is set. */
  compact?: boolean
  className?: string
  /** Custom trigger content (e.g. "Add row"). */
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<{
    id: string
    name: string
    clientName: string | null
  } | null>(null)
  const projects = useProjects({ status: "active", pageSize: 100 }, open)
  const tasks = useTasks(step?.id ?? "")
  const openTasks = (tasks.data ?? []).filter((t) => t.status !== "done")

  const groups = React.useMemo(() => {
    const map = new Map<string, NonNullable<typeof projects.data>["items"]>()
    for (const p of projects.data?.items ?? []) {
      const key = p.clientName ?? "Internal"
      map.set(key, [...(map.get(key) ?? []), p])
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === "Internal" ? 1 : b === "Internal" ? -1 : a.localeCompare(b)
    )
  }, [projects.data])

  const pick = (target: ProjectTarget, l: ProjectLabel) => {
    onChange(target, l)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setStep(null)
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        aria-label={
          trigger
            ? undefined
            : label.projectName
              ? `Project: ${label.projectName}${label.taskTitle ? `, task: ${label.taskTitle}` : ""}`
              : "Choose project"
        }
        className={cn(
          "inline-flex h-8 max-w-full min-w-8 items-center justify-center gap-1.5 rounded-md px-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60",
          !label.projectName && "text-muted-foreground",
          className
        )}
      >
        {trigger ? (
          trigger
        ) : label.projectName ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-full bg-primary"
              aria-hidden
            />
            <span className="truncate font-medium text-primary">
              {label.projectName}
              {label.taskTitle ? `: ${label.taskTitle}` : ""}
            </span>
            {label.clientName ? (
              <span className="hidden truncate text-muted-foreground lg:inline">
                · {label.clientName}
              </span>
            ) : null}
          </span>
        ) : (
          <>
            <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.8} size={16} />
            {compact ? null : <span>Project</span>}
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {step ? (
          <Command>
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-left text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setStep(null)}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
              {step.name}
            </button>
            <CommandInput placeholder="Find a task…" />
            <CommandList>
              <CommandEmpty>No open tasks</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__no_task__"
                  data-checked={value.projectId === step.id && !value.taskId}
                  onSelect={() =>
                    pick(
                      { projectId: step.id, taskId: null },
                      {
                        projectName: step.name,
                        clientName: step.clientName,
                        taskTitle: null,
                      }
                    )
                  }
                >
                  No task
                </CommandItem>
                {openTasks.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`${t.title} ${t.id}`}
                    data-checked={value.taskId === t.id}
                    onSelect={() =>
                      pick(
                        { projectId: step.id, taskId: t.id },
                        {
                          projectName: step.name,
                          clientName: step.clientName,
                          taskTitle: t.title,
                        }
                      )
                    }
                  >
                    <span className="truncate">{t.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <Command>
            <CommandInput placeholder="Find a project or client…" />
            <CommandList>
              <CommandEmpty>
                {projects.isPending ? "Loading…" : "No matching projects"}
              </CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__no_project__ No project"
                  data-checked={!value.projectId}
                  onSelect={() =>
                    pick(
                      { projectId: null, taskId: null },
                      { projectName: null, clientName: null, taskTitle: null }
                    )
                  }
                >
                  <span className="text-muted-foreground">No project</span>
                </CommandItem>
              </CommandGroup>
              {groups.map(([client, items]) => (
                <CommandGroup key={client} heading={client}>
                  {items.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${p.clientName ?? ""} ${p.id}`}
                      data-checked={value.projectId === p.id}
                      onSelect={() =>
                        pick(
                          { projectId: p.id, taskId: null },
                          {
                            projectName: p.name,
                            clientName: p.clientName,
                            taskTitle: null,
                          }
                        )
                      }
                    >
                      <span className="truncate">{p.name}</span>
                      {p.taskCounts.todo + p.taskCounts.in_progress > 0 ? (
                        <button
                          type="button"
                          className="ml-auto flex shrink-0 items-center gap-0.5 rounded px-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation()
                            setStep({
                              id: p.id,
                              name: p.name,
                              clientName: p.clientName,
                            })
                          }}
                          aria-label={`Tasks of ${p.name}`}
                        >
                          {p.taskCounts.todo + p.taskCounts.in_progress} tasks
                          <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
                        </button>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
