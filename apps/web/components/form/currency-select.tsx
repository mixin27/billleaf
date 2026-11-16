"use client"

import { COMMON_CURRENCIES } from "@workspace/contracts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const NONE = "__none__"

/** Currency picker. With `allowEmpty`, an empty choice means "use the default". */
export function CurrencySelect({
  id,
  value,
  onChange,
  allowEmpty,
  emptyLabel = "Workspace default",
  disabled,
}: {
  id?: string
  disabled?: boolean
  value: string | null | undefined
  onChange: (value: string | null) => void
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const options = [...COMMON_CURRENCIES] as string[]
  if (value && !options.includes(value)) options.unshift(value)
  // `items` lets <SelectValue> show labels instead of raw values.
  const items: Record<string, string> = {
    ...(allowEmpty ? { [NONE]: emptyLabel } : {}),
    ...Object.fromEntries(options.map((c) => [c, c])),
  }
  return (
    <Select
      items={items}
      value={value ?? (allowEmpty ? NONE : null)}
      disabled={disabled}
      onValueChange={(v) =>
        onChange(v === NONE || v == null ? null : String(v))
      }
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Select currency" />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty ? <SelectItem value={NONE}>{emptyLabel}</SelectItem> : null}
        {options.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
