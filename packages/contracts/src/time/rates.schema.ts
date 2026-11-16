import { z } from "zod"

import { secondsToHours } from "./time.schema.js"

/**
 * Hourly rates. Billable rates are resolved most specific first:
 * task → project → member → workspace default. Member and workspace rates
 * are in the workspace default currency (when saved) and only apply to
 * projects in that currency; nothing is converted between currencies.
 * Cost rates (what an hour of a member's time costs) live on members.
 * All amounts are minor units per hour.
 */

const rateAmount = z.number().int().min(0).max(100_000_000).nullable()

export const memberRateSchema = z.object({
  memberId: z.string(),
  name: z.string(),
  email: z.string(),
  /** Currency the rates were saved in; null = no rates yet. */
  currency: z.string().nullable(),
  hourlyRate: z.number().int().nullable(),
  costRate: z.number().int().nullable(),
})
export type MemberRate = z.infer<typeof memberRateSchema>

export const workspaceRatesSchema = z.object({
  /** Workspace default currency: new rates are saved in it. */
  currency: z.string(),
  defaultHourlyRate: z.number().int().nullable(),
  members: z.array(memberRateSchema),
})
export type WorkspaceRates = z.infer<typeof workspaceRatesSchema>

export const updateDefaultRateSchema = z.object({ hourlyRate: rateAmount })
export type UpdateDefaultRateInput = z.input<typeof updateDefaultRateSchema>

export const updateMemberRateSchema = z.object({
  hourlyRate: rateAmount,
  costRate: rateAmount,
})
export type UpdateMemberRateInput = z.input<typeof updateMemberRateSchema>

export type RateSource = "task" | "project" | "member" | "workspace"

/** Money for a duration at an hourly rate (matches invoice line math). */
export function amountForSeconds(seconds: number, hourlyRate: number): number {
  return Math.round(secondsToHours(seconds) * hourlyRate)
}

/**
 * The billable rate for time on a project, or null when the project isn't
 * hourly or nothing sets a rate in its currency.
 */
export function resolveHourlyRate(p: {
  billing: string
  currency: string
  projectRate: number | null
  taskRate?: number | null
  member?: { currency: string; hourlyRate: number | null } | null
  workspace?: { currency: string; hourlyRate: number | null } | null
}): { rate: number; source: RateSource } | null {
  if (p.billing !== "hourly") return null
  if (p.taskRate != null) return { rate: p.taskRate, source: "task" }
  if (p.projectRate != null) return { rate: p.projectRate, source: "project" }
  if (p.member?.hourlyRate != null && p.member.currency === p.currency)
    return { rate: p.member.hourlyRate, source: "member" }
  if (p.workspace?.hourlyRate != null && p.workspace.currency === p.currency)
    return { rate: p.workspace.hourlyRate, source: "workspace" }
  return null
}

// ── Budgets ───────────────────────────────────────────────

/** Alerts go out once each at these percentages of an estimate. */
export const BUDGET_THRESHOLDS = [80, 100] as const

/** Highest threshold reached (e.g. 100 at 130%), or null below the first. */
export function budgetThreshold(used: number, estimate: number) {
  if (estimate <= 0) return null
  const pct = (used / estimate) * 100
  return [...BUDGET_THRESHOLDS].reverse().find((t) => pct >= t) ?? null
}

/** Usage of one project: tracked time, money and (with rate.read) cost. */
export const projectUsageSchema = z.object({
  projectId: z.string(),
  trackedSeconds: z.number().int(),
  billableSeconds: z.number().int(),
  unbilledSeconds: z.number().int(),
  /** Billable time × rate (invoiced time at the rate it was invoiced at). Null unless hourly. */
  billableAmount: z.number().int().nullable(),
  /** Uninvoiced billable time × current rate. Null unless hourly. */
  unbilledAmount: z.number().int().nullable(),
  /** Uninvoiced billable seconds with no rate set anywhere. */
  unratedSeconds: z.number().int(),
  /** Tracked time × member cost rates; null without rate.read. */
  cost: z.number().int().nullable(),
  /** Seconds whose member has no cost rate in the project currency. */
  uncostedSeconds: z.number().int(),
  currency: z.string(),
})
export type ProjectUsage = z.infer<typeof projectUsageSchema>

/** A project with an estimate, for the dashboard's budgets card. */
export const projectBudgetSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  clientName: z.string().nullable(),
  currency: z.string(),
  estimateMinutes: z.number().int().nullable(),
  estimateAmount: z.number().int().nullable(),
  trackedSeconds: z.number().int(),
  billableAmount: z.number().int().nullable(),
  /** Highest share of an estimate used, in percent (rounded). */
  percent: z.number().int(),
})
export type ProjectBudget = z.infer<typeof projectBudgetSchema>
