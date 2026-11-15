"use client"

import { cn } from "@workspace/ui/lib/utils"
import type * as React from "react"

import { useBreadcrumbTitle } from "./layout/breadcrumb-store"

/**
 * Page title row used by every page: title (+ status badge), optional
 * description and meta line, and actions on the right (wrapping below on
 * small screens). Also names the page in the top-bar breadcrumbs.
 */
export function PageHeader({
  title,
  badge,
  description,
  meta,
  actions,
  breadcrumb,
  className,
}: {
  title: React.ReactNode
  badge?: React.ReactNode
  description?: React.ReactNode
  /** Small print under the description (links to related records, dates…). */
  meta?: React.ReactNode
  actions?: React.ReactNode
  /** Breadcrumb label; defaults to `title` when it is a string. */
  breadcrumb?: string | null
  className?: string
}) {
  useBreadcrumbTitle(
    breadcrumb !== undefined
      ? breadcrumb
      : typeof title === "string"
        ? title
        : null
  )
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-3",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        {meta ? (
          <div className="text-xs text-muted-foreground">{meta}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
