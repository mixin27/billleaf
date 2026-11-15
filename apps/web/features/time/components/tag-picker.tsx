"use client"

import { TAG_COLORS, type Tag } from "@workspace/contracts"
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
import { Add01Icon, Tag01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { errorMessage } from "@/lib/api"

import { useCreateTag } from "../api/mutations"
import { useTags } from "../api/queries"
import { TAG_DOT_CLASSES, TagChip } from "./tag-chip"

/**
 * Multi-select of workspace tags with "Create …" for a new name. The trigger
 * shows the selected tags, or a tag icon when there are none.
 */
export function TagPicker({
  value,
  onChange,
  disabled,
  className,
  compact,
}: {
  value: Tag[]
  onChange: (tags: Tag[]) => void
  disabled?: boolean
  className?: string
  /** Icon-only trigger when nothing is selected (timer bar, rows). */
  compact?: boolean
}) {
  const { can } = usePermissions()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const tags = useTags(open || value.length > 0)
  const create = useCreateTag()
  const all = tags.data ?? []
  const selected = new Set(value.map((t) => t.id))
  const trimmed = search.trim()
  const exact = all.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())
  const canCreate = can("time.track") || can("time.manage")

  const toggle = (tag: Tag) =>
    onChange(
      selected.has(tag.id)
        ? value.filter((t) => t.id !== tag.id)
        : [...value, tag].sort((a, b) => a.name.localeCompare(b.name))
    )

  const createTag = () =>
    create.mutate(
      {
        name: trimmed,
        // Rotate through the palette so new tags are easy to tell apart.
        color: TAG_COLORS[(all.length + 1) % TAG_COLORS.length],
      },
      {
        onSuccess: (tag) => {
          setSearch("")
          toggle(tag)
        },
        onError: (err) => toast.error(errorMessage(err)),
      }
    )

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setSearch("")
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        aria-label={
          value.length
            ? `Tags: ${value.map((t) => t.name).join(", ")}`
            : "Add tags"
        }
        className={cn(
          "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-1.5 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60",
          value.length > 0 && "text-foreground",
          className
        )}
      >
        {value.length === 0 ? (
          <>
            <HugeiconsIcon icon={Tag01Icon} strokeWidth={1.8} size={16} />
            {compact ? null : <span className="text-sm">Tags</span>}
          </>
        ) : (
          <span className="flex max-w-56 flex-wrap items-center gap-1">
            {value.slice(0, 2).map((t) => (
              <TagChip key={t.id} tag={t} />
            ))}
            {value.length > 2 ? (
              <span className="text-xs text-muted-foreground">
                +{value.length - 2}
              </span>
            ) : null}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command
          filter={(itemValue, q) =>
            itemValue.toLowerCase().includes(q.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput
            placeholder="Find or create a tag…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {trimmed ? "No matching tags" : "No tags yet"}
            </CommandEmpty>
            {all.length > 0 ? (
              <CommandGroup>
                {all.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.name}
                    data-checked={selected.has(t.id)}
                    onSelect={() => toggle(t)}
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        TAG_DOT_CLASSES[t.color ?? "gray"]
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{t.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {canCreate && trimmed && !exact ? (
              <CommandGroup>
                <CommandItem
                  value={`__create__ ${trimmed}`}
                  onSelect={createTag}
                  disabled={create.isPending}
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
                  Create “{trimmed}”
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
