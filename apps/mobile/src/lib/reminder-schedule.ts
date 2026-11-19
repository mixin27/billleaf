import type { TimeEntry } from "@workspace/contracts"

/** The choices for how long a timer runs before we ask about it. */
export const REMINDER_HOURS = [4, 6, 8, 10] as const
/** Until you pick: a full working day. */
export const DEFAULT_REMINDER_HOURS = 8

/** When the reminder for this timer is due (epoch ms). */
export function reminderAt(entry: Pick<TimeEntry, "startedAt">, hours: number) {
  return Date.parse(entry.startedAt) + hours * 3_600_000
}

/** “Wireframes” on Website has been running for 8 hours. … */
export function reminderBody(
  entry: Pick<TimeEntry, "description" | "projectName">,
  hours: number
) {
  const what = entry.description?.trim()
  return `${what ? `“${what}”` : "Your timer"}${
    entry.projectName ? ` on ${entry.projectName}` : ""
  } has been running for ${hours} hours. Stop it if you're done.`
}
