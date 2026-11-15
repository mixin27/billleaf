import type { PartySnapshot } from "@workspace/contracts"

interface Addressable {
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
}

export function addressLines(a: Addressable): string[] {
  return [
    a.addressLine1,
    a.addressLine2,
    [a.city, a.state, a.postalCode].filter(Boolean).join(" ") || null,
    a.country,
  ].filter((l): l is string => Boolean(l))
}

export function partySnapshot(
  p: Addressable & {
    name: string
    legalName?: string | null
    email: string | null
    phone: string | null
    taxId: string | null
  }
): PartySnapshot {
  return {
    name: p.name,
    legalName: p.legalName ?? null,
    email: p.email,
    phone: p.phone,
    taxId: p.taxId,
    addressLines: addressLines(p),
  }
}

/** Today's date (YYYY-MM-DD) in the given IANA timezone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
