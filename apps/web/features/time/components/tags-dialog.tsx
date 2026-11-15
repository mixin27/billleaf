"use client"

import { TAG_COLORS, type Tag, type TagColor } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"
import { toast } from "sonner"

import { errorMessage } from "@/lib/api"

import { useDeleteTag, useUpdateTag } from "../api/mutations"
import { useTags } from "../api/queries"
import { TAG_DOT_CLASSES } from "./tag-chip"

/** Rename, recolour or delete workspace tags (time.manage). */
export function TagsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const tags = useTags(open)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription>
            Tags are shared by the whole workspace. Create new ones from the
            timer bar; deleting a tag removes it from every entry.
          </DialogDescription>
        </DialogHeader>
        {tags.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags yet.</p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
            {(tags.data ?? []).map((t) => (
              <TagRow key={t.id} tag={t} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TagRow({ tag }: { tag: Tag }) {
  const update = useUpdateTag()
  const remove = useDeleteTag()
  const [name, setName] = React.useState(tag.name)
  const onError = (err: unknown) => {
    toast.error(errorMessage(err))
    setName(tag.name)
  }
  return (
    <li className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger
          aria-label={`Colour of ${tag.name}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
        >
          <span
            className={cn(
              "size-3 rounded-full",
              TAG_DOT_CLASSES[tag.color ?? "gray"]
            )}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto" align="start">
          <div className="grid grid-cols-5 gap-1">
            {TAG_COLORS.map((c: TagColor) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={tag.color === c}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md hover:bg-muted",
                  tag.color === c && "ring-2 ring-ring"
                )}
                onClick={() =>
                  update.mutate({ id: tag.id, color: c }, { onError })
                }
              >
                <span
                  className={cn("size-3 rounded-full", TAG_DOT_CLASSES[c])}
                />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        value={name}
        aria-label="Tag name"
        className="h-8"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        onBlur={() => {
          const next = name.trim()
          if (next && next !== tag.name)
            update.mutate({ id: tag.id, name: next }, { onError })
          else setName(tag.name)
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={`Delete ${tag.name}`}
        disabled={remove.isPending}
        onClick={() =>
          remove.mutate(tag.id, {
            onSuccess: () => toast.success(`Deleted “${tag.name}”`),
            onError,
          })
        }
      >
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
      </Button>
    </li>
  )
}
