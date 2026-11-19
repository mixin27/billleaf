import type { TimeEntry } from "@workspace/contracts"

/** How long a timer runs before we ask whether you forgot it. */
export const REMIND_AFTER_HOURS = 8

/** When the reminder for this timer is due (epoch ms). */
export function reminderAt(entry: Pick<TimeEntry, "startedAt">) {
  return Date.parse(entry.startedAt) + REMIND_AFTER_HOURS * 3_600_000
}

/** “Wireframes” on Website has been running for 8 hours. … */
export function reminderBody(
  entry: Pick<TimeEntry, "description" | "projectName">
) {
  const what = entry.description?.trim()
  return `${what ? `“${what}”` : "Your timer"}${
    entry.projectName ? ` on ${entry.projectName}` : ""
  } has been running for ${REMIND_AFTER_HOURS} hours. Stop it if you're done.`
}
