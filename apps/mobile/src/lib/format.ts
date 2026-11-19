/**
 * "12 Nov" for a calendar date (YYYY-MM-DD), with the year when it isn't
 * the year of `today`. Read as UTC so the day never shifts with the
 * phone's time zone.
 */
export function shortDate(iso: string, locale: string, today?: string) {
  const sameYear = !today || today.slice(0, 4) === iso.slice(0, 4)
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`))
}
