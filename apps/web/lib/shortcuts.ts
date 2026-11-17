"use client"

import * as React from "react"

/** Typing into a field, so single-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

/** A dialog, menu or popover is open: leave keys to it. */
function overlayOpen() {
  return Boolean(
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'
    )
  )
}

/**
 * Run `handler` when one of `keys` is pressed (KeyboardEvent.key, e.g. "s",
 * "?", "ArrowLeft"), unless the user is typing, a modifier is held (Shift
 * is fine, for "?"), or a dialog/menu is open. Letters match either case.
 */
export function useShortcut(
  keys: string | string[],
  handler: (event: KeyboardEvent) => void,
  enabled = true
) {
  const ref = React.useRef(handler)
  React.useEffect(() => {
    ref.current = handler
  })
  const list = (Array.isArray(keys) ? keys : [keys]).join("|")
  React.useEffect(() => {
    if (!enabled) return
    const wanted = list.split("|")
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target) || overlayOpen()) return
      // "?" by its physical key too (Shift+/), whatever the layout reports.
      const key =
        e.shiftKey && e.code === "Slash"
          ? "?"
          : e.key.length === 1
            ? e.key.toLowerCase()
            : e.key
      if (!wanted.includes(key)) return
      e.preventDefault()
      ref.current(e)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [list, enabled])
}
