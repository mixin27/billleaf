"use client"

import type { TimeFavorite } from "@workspace/contracts"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"
import {
  MoreHorizontalIcon,
  PlayIcon,
  StarIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { toast } from "sonner"

import { errorMessage } from "@/lib/api"

import {
  useDeleteFavorite,
  useReorderFavorites,
  useStartFavorite,
  useTimeFavorites,
} from "../api/favorites"
import { TAG_DOT_CLASSES } from "./tag-chip"

export const favoriteLabel = (f: TimeFavorite) =>
  f.description || f.taskTitle || f.projectName || "Favourite"

/** Start a favourite with the standard toast (used by chips and keys 1–9). */
export function useStartFavoriteAction() {
  const start = useStartFavorite()
  return {
    pending: start.isPending,
    start: (f: TimeFavorite) =>
      start.mutate(f.id, {
        onSuccess: () => toast.success(`Started “${favoriteLabel(f)}”`),
        onError: (e) => toast.error(errorMessage(e)),
      }),
  }
}

/**
 * Pinned entries under the timer: click to start one (keys 1–9 do the
 * same). Each chip's menu moves it or removes it.
 */
export function FavoritesBar() {
  const favorites = useTimeFavorites()
  const { start, pending } = useStartFavoriteAction()
  const reorder = useReorderFavorites()
  const remove = useDeleteFavorite()
  const items = favorites.data ?? []
  if (favorites.isPending) return null

  const move = (index: number, by: -1 | 1) => {
    const ids = items.map((f) => f.id)
    const [id] = ids.splice(index, 1)
    ids.splice(index + by, 0, id!)
    reorder.mutate(ids, { onError: (e) => toast.error(errorMessage(e)) })
  }

  if (items.length === 0)
    return (
      <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <HugeiconsIcon icon={StarIcon} size={13} strokeWidth={1.8} />
        Pin what you do often with the star in the timer, or “Add to favourites”
        on an entry, then start it in one click (or press 1–9).
      </p>
    )

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      aria-label="Favourites"
      role="group"
    >
      <HugeiconsIcon
        icon={StarIcon}
        size={14}
        strokeWidth={1.8}
        className="text-muted-foreground"
        aria-hidden
      />
      {items.map((f, i) => (
        <div
          key={f.id}
          className="group flex h-8 max-w-64 items-center rounded-md border bg-card text-sm shadow-xs"
        >
          <button
            type="button"
            disabled={pending}
            onClick={() => start(f)}
            title={[
              favoriteLabel(f),
              [f.projectName, f.taskTitle, f.clientName]
                .filter(Boolean)
                .join(" · "),
              i < 9 ? `Press ${i + 1} to start` : "",
            ]
              .filter(Boolean)
              .join("\n")}
            aria-label={`Start ${favoriteLabel(f)}${f.projectName ? `, ${f.projectName}` : ""}`}
            className="flex h-full min-w-0 items-center gap-1.5 rounded-l-md pr-1 pl-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {i < 9 ? (
              <kbd className="rounded border px-1 font-mono text-[10px] leading-4 text-muted-foreground">
                {i + 1}
              </kbd>
            ) : null}
            <HugeiconsIcon
              icon={PlayIcon}
              size={12}
              strokeWidth={2}
              className="shrink-0 text-primary"
            />
            <span className="truncate">{favoriteLabel(f)}</span>
            {f.projectName && f.description ? (
              <span className="truncate text-xs text-muted-foreground">
                · {f.projectName}
              </span>
            ) : null}
            {f.tags.slice(0, 3).map((t) => (
              <span
                key={t.id}
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  TAG_DOT_CLASSES[t.color ?? "gray"]
                )}
              />
            ))}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex h-full w-6 shrink-0 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`More for ${favoriteLabel(f)}`}
            >
              <HugeiconsIcon
                icon={MoreHorizontalIcon}
                size={14}
                strokeWidth={1.8}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={i === 0} onClick={() => move(i, -1)}>
                Move left
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
              >
                Move right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() =>
                  remove.mutate(f.id, {
                    onSuccess: () => toast.success("Removed from favourites"),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  )
}
