"use client"

import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"

/**
 * Single-series bar charts (one hue → no legend; the card title names the
 * series). Thin bars, 4px rounded data-ends anchored to the baseline, 2px
 * gaps, recessive grid, hover/focus tooltips, and a visually-hidden table
 * so values are never colour- or hover-only.
 */
const BAR = "bg-[var(--color-chart-3)] dark:bg-[var(--color-chart-2)]"

export interface BarDatum {
  key: string
  label: string
  value: number
  display: string
}

function Tooltip({ text, show }: { text: string; show: boolean }) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm transition-opacity",
        show ? "opacity-100" : "opacity-0"
      )}
      style={{ left: "50%", bottom: "calc(100% + 6px)" }}
    >
      {text}
    </span>
  )
}

/** Vertical columns over time (e.g. revenue by month). Only the latest bar is direct-labelled. */
export function ColumnChart({
  data,
  caption,
}: {
  data: BarDatum[]
  caption: string
}) {
  const [active, setActive] = React.useState<string | null>(null)
  const max = Math.max(...data.map((d) => d.value), 1)
  const last = data[data.length - 1]
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative h-44">
        {/* Recessive grid: quarter lines */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <div
            key={f}
            className="absolute inset-x-0 border-t border-dashed border-border/60"
            style={{ bottom: `${f * 100}%` }}
          />
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px] border-b">
          {data.map((d) => (
            <div
              key={d.key}
              className="relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setActive(d.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(d.key)}
              onBlur={() => setActive(null)}
              tabIndex={0}
              aria-label={`${d.label}: ${d.display}`}
            >
              <div
                className={cn(
                  BAR,
                  "w-full max-w-10 rounded-t-[4px] transition-opacity",
                  active && active !== d.key && "opacity-60"
                )}
                style={{
                  height:
                    d.value > 0 ? `max(2px, ${(d.value / max) * 100}%)` : "0",
                }}
              />
              <Tooltip
                text={`${d.label} · ${d.display}`}
                show={active === d.key}
              />
              {d.key === last?.key && d.value > 0 ? (
                <span
                  className="absolute text-[10px] text-muted-foreground tabular-nums"
                  style={{ bottom: `calc(${(d.value / max) * 100}% + 4px)` }}
                >
                  {d.display}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-[2px] text-xs text-muted-foreground">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center">
            {d.label}
          </span>
        ))}
      </div>
      <DataTable caption={caption} data={data} />
    </figure>
  )
}

/** Horizontal bars for categories (e.g. receivables aging). Every bar is labelled. */
export function BarList({
  data,
  caption,
}: {
  data: BarDatum[]
  caption: string
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <figure className="flex flex-col gap-2">
      {data.map((d) => (
        <div
          key={d.key}
          className="grid grid-cols-[88px_1fr_minmax(96px,auto)] items-center gap-3 text-sm"
          title={`${d.label}: ${d.display}`}
        >
          <span className="text-xs text-muted-foreground">{d.label}</span>
          <div className="h-3 overflow-hidden rounded-[4px] bg-muted/50">
            <div
              className={cn(BAR, "h-full rounded-r-[4px]")}
              style={{
                width:
                  d.value > 0 ? `max(4px, ${(d.value / max) * 100}%)` : "0",
              }}
            />
          </div>
          <span className="text-right text-xs tabular-nums">{d.display}</span>
        </div>
      ))}
      <DataTable caption={caption} data={data} />
    </figure>
  )
}

function DataTable({ caption, data }: { caption: string; data: BarDatum[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {data.map((d) => (
          <tr key={d.key}>
            <th scope="row">{d.label}</th>
            <td>{d.display}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
