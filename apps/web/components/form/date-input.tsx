"use client"

import { Calendar03Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"

import { formatDate } from "@/lib/format"

/** "2026-11-15" → local midnight, so the calendar highlights the same day. */
function toDate(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}

function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * A date field that is either empty or a whole date ("YYYY-MM-DD"), never
 * half filled like the browser's own date input. Pick from the calendar;
 * optional fields have a clear button.
 */
export function DateInput({
  id,
  value,
  onChange,
  onBlur,
  placeholder = "Pick a date",
  required,
  min,
  max,
  disabled,
  invalid,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string
  value: string | null | undefined
  onChange: (value: string) => void
  onBlur?: () => void
  /** Shown when empty, e.g. "Today" or "No end date". */
  placeholder?: string
  /** Blocks submitting the form while empty, like a required input. */
  required?: boolean
  min?: string
  max?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  "aria-label"?: string
}) {
  const [open, setOpen] = React.useState(false)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const selected = value ? toDate(value) : undefined
  const minDate = min ? toDate(min) : undefined
  const maxDate = max ? toDate(max) : undefined
  const today = new Date()
  const todayIso = toIso(today)
  const todayAllowed = (!min || todayIso >= min) && (!max || todayIso <= max)
  const year = today.getFullYear()

  const pick = (iso: string) => {
    onChange(iso)
    setOpen(false)
    onBlur?.()
  }

  return (
    <div className={cn("relative", className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) onBlur?.()
        }}
      >
        <PopoverTrigger
          ref={trigger}
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          render={
            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full justify-start px-2.5 font-normal",
                !value && "text-muted-foreground",
                value && !required && "pr-8"
              )}
            />
          }
        >
          <HugeiconsIcon
            icon={Calendar03Icon}
            strokeWidth={1.8}
            className="text-muted-foreground"
          />
          <span className="truncate">
            {value ? formatDate(value) : placeholder}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected ?? maxDate ?? today}
            startMonth={minDate ?? new Date(year - 20, 0)}
            endMonth={maxDate ?? new Date(year + 10, 11)}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            onSelect={(d) => {
              if (d) pick(toIso(d))
              else if (!required) pick("")
            }}
            autoFocus
          />
          {todayAllowed || (value && !required) ? (
            <div className="flex justify-between gap-2 border-t p-2">
              {todayAllowed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => pick(todayIso)}
                >
                  Today
                </Button>
              ) : (
                <span />
              )}
              {value && !required ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => pick("")}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {value && !required && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Clear date"
          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
          onClick={() => {
            onChange("")
            onBlur?.()
            trigger.current?.focus()
          }}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
        </Button>
      ) : null}
      {/* Lets the browser's form validation stop an empty required date. */}
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value ?? ""}
          onChange={() => {}}
          onFocus={() => trigger.current?.focus()}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />
      ) : null}
    </div>
  )
}
