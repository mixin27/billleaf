"use client"

import {
  Add01Icon,
  ComputerIcon,
  Moon02Icon,
  PlayIcon,
  StopIcon,
  Sun03Icon,
  KeyboardIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import type { Permission } from "@workspace/contracts"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@workspace/ui/components/command"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import * as React from "react"

import {
  useRunningTimer,
  useStopTimerAction,
  useTimerDialog,
} from "@/features/time"

import { usePermissions } from "../permissions/can"
import { useCommandMenu } from "./command-store"
import { useShortcutsHelp } from "./keyboard-shortcuts"
import { useNav } from "./use-nav"

const CREATE: {
  label: string
  path: string
  permission: Permission
}[] = [
  { label: "New quote", path: "/quotes/new", permission: "quote.create" },
  { label: "New invoice", path: "/invoices/new", permission: "invoice.create" },
  {
    label: "New client",
    path: "/clients?new=true",
    permission: "client.create",
  },
  {
    label: "New contract",
    path: "/contracts/new",
    permission: "contract.create",
  },
  {
    label: "New project",
    path: "/projects?new=true",
    permission: "project.create",
  },
  {
    label: "New cashbook",
    path: "/cashbook?new=true",
    permission: "cashbook.create",
  },
  {
    label: "New recurring invoice",
    path: "/invoices/recurring/new",
    permission: "invoice.create",
  },
]

const THEMES: { value: string; label: string; icon: IconSvgElement }[] = [
  { value: "light", label: "Light theme", icon: Sun03Icon },
  { value: "dark", label: "Dark theme", icon: Moon02Icon },
  { value: "system", label: "System theme", icon: ComputerIcon },
]

/** ⌘K / Ctrl+K: jump anywhere, create things, control the timer and theme. */
export function CommandMenu() {
  const router = useRouter()
  const { open, setOpen } = useCommandMenu()
  const { base, groups, settings } = useNav()
  const { can } = usePermissions()
  const { setTheme } = useTheme()
  const canTrack = can("time.track") || can("time.manage")
  const running = useRunningTimer(canTrack)
  const openTimer = useTimerDialog((s) => s.setOpen)
  const { stop } = useStopTimerAction()
  const openShortcuts = useShortcutsHelp((s) => s.setOpen)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!useCommandMenu.getState().open)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [setOpen])

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }
  const pages = [
    ...groups.flatMap((g) => g.items),
    ...(settings ? [settings] : []),
  ]

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command menu">
      <Command>
        <CommandInput placeholder="Search pages and actions…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Go to">
            {pages.map((p) => (
              <CommandItem
                key={p.href}
                value={`go ${p.title} ${(p.keywords ?? []).join(" ")}`}
                onSelect={() => run(() => router.push(p.url))}
              >
                <HugeiconsIcon icon={p.icon} strokeWidth={1.8} />
                {p.title}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Create">
            {CREATE.filter((c) => can(c.permission)).map((c) => (
              <CommandItem
                key={c.path}
                value={`create ${c.label}`}
                onSelect={() => run(() => router.push(`${base}${c.path}`))}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
                {c.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {canTrack ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Timer">
                {running.data ? (
                  <CommandItem value="stop timer" onSelect={() => run(stop)}>
                    <HugeiconsIcon icon={StopIcon} strokeWidth={1.8} />
                    Stop timer
                  </CommandItem>
                ) : (
                  <CommandItem
                    value="start timer track time"
                    onSelect={() => run(() => openTimer(true))}
                  >
                    <HugeiconsIcon icon={PlayIcon} strokeWidth={1.8} />
                    Start timer
                  </CommandItem>
                )}
              </CommandGroup>
            </>
          ) : null}
          <CommandSeparator />
          <CommandGroup heading="Preferences">
            <CommandItem
              value="keyboard shortcuts keys help"
              onSelect={() => run(() => openShortcuts(true))}
            >
              <HugeiconsIcon icon={KeyboardIcon} strokeWidth={1.8} />
              Keyboard shortcuts
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
            {THEMES.map((t) => (
              <CommandItem
                key={t.value}
                value={t.label}
                onSelect={() => run(() => setTheme(t.value))}
              >
                <HugeiconsIcon icon={t.icon} strokeWidth={1.8} />
                {t.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      <div className="flex items-center justify-end border-t px-3 py-2 text-xs text-muted-foreground">
        Toggle with <CommandShortcut className="ml-1">⌘K</CommandShortcut>
      </div>
    </CommandDialog>
  )
}
