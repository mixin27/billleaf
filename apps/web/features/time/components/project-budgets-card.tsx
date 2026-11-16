"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import Link from "next/link"

import { useWorkspaceStore } from "@/features/workspace"
import { money } from "@/lib/format"

import { useProjectBudgets } from "../api/queries"
import { BudgetBar, hoursLabel } from "./budget-bar"

/**
 * Dashboard: active projects with an estimate, the most used first. Shows
 * the estimate that's furthest along. Hidden when no project has one.
 */
export function ProjectBudgetsCard({ locale }: { locale?: string }) {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const budgets = useProjectBudgets()
  const items = (budgets.data ?? []).slice(0, 5)
  if (items.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Project budgets</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {items.map((b) => {
            const hoursPct = b.estimateMinutes
              ? b.trackedSeconds / 60 / b.estimateMinutes
              : -1
            const amountPct =
              b.estimateAmount && b.billableAmount !== null
                ? b.billableAmount / b.estimateAmount
                : -1
            const byAmount = amountPct > hoursPct
            return (
              <li key={b.projectId}>
                <Link
                  href={`/${slug}/projects/${b.projectId}`}
                  className="flex flex-col gap-1.5 rounded-md hover:bg-muted/40"
                >
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">
                      {b.name}
                      {b.clientName ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {b.clientName}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {byAmount
                        ? `${money(b.billableAmount!, b.currency, locale)} of ${money(b.estimateAmount!, b.currency, locale)}`
                        : `${hoursLabel(b.trackedSeconds)} of ${hoursLabel(b.estimateMinutes! * 60)}`}{" "}
                      · {b.percent}%
                    </span>
                  </div>
                  <BudgetBar
                    compact
                    label={`${b.name} budget`}
                    used={b.percent}
                    estimate={100}
                    usedText={`${b.percent}%`}
                    estimateText="100%"
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
