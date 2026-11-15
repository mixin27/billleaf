"use client"

import type { LineItem, PartySnapshot } from "@workspace/contracts"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { money } from "@/lib/format"

type Addressable = {
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
}

export function addressLines(a: Addressable) {
  return [
    a.addressLine1,
    a.addressLine2,
    [a.city, a.state, a.postalCode].filter(Boolean).join(" ") || null,
    a.country,
  ].filter((l): l is string => Boolean(l))
}

/** Live party block for drafts (issued documents use their frozen snapshot). */
export function toParty(
  p:
    | (Addressable & {
        name: string
        email: string | null
        phone: string | null
        taxId: string | null
        legalName?: string | null
      })
    | undefined
): PartySnapshot | null {
  if (!p) return null
  return {
    name: p.name,
    legalName: p.legalName ?? null,
    email: p.email,
    phone: p.phone,
    taxId: p.taxId,
    addressLines: addressLines(p),
  }
}

/** Document-style rendering of a quote or invoice (From/For, meta, lines, totals). */
export function DocumentSheet({
  issuer,
  recipient,
  recipientLabel = "For",
  meta,
  lines,
  currency,
  locale,
  subtotal,
  taxTotal,
  total,
  extraTotals = [],
  notes,
  terms,
  footer,
  logoUrl,
}: {
  issuer: PartySnapshot | null
  recipient: PartySnapshot | null
  recipientLabel?: string
  meta: { label: string; value: string }[]
  lines: LineItem[]
  currency: string
  locale?: string
  subtotal: number
  taxTotal: number
  total: number
  extraTotals?: { label: string; amount: number; strong?: boolean }[]
  notes?: string | null
  terms?: string | null
  footer?: string | null
  logoUrl?: string | null
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-8 p-6 sm:p-10">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL
          <img
            src={logoUrl}
            alt=""
            className="max-h-12 max-w-40 self-end object-contain"
          />
        ) : null}
        <div className="grid gap-6 sm:grid-cols-2">
          <Party label="From" party={issuer} />
          <Party label={recipientLabel} party={recipient} />
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {meta.map((m) => (
            <div key={m.label}>
              <dt className="text-xs text-muted-foreground">{m.label}</dt>
              <dd className="mt-0.5 font-medium">{m.value}</dd>
            </div>
          ))}
        </dl>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Tax
              </TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No line items yet.
                </TableCell>
              </TableRow>
            ) : (
              lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-pre-line">
                    {l.description}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.quantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(l.unitPrice, currency, locale)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {l.taxRateBps ? `${l.taxRateBps / 100}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(l.amount, currency, locale)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-right tabular-nums">
            {money(subtotal, currency, locale)}
          </dd>
          <dt className="text-muted-foreground">Tax</dt>
          <dd className="text-right tabular-nums">
            {money(taxTotal, currency, locale)}
          </dd>
          <dt className="font-medium">Total</dt>
          <dd className="text-right font-medium tabular-nums">
            {money(total, currency, locale)}
          </dd>
          {extraTotals.map((t) => (
            <Row
              key={t.label}
              label={t.label}
              value={money(t.amount, currency, locale)}
              strong={t.strong}
            />
          ))}
        </dl>

        {notes || terms ? (
          <div className="grid gap-6 text-sm sm:grid-cols-2">
            {notes ? <TextBlock label="Notes" text={notes} /> : null}
            {terms ? <TextBlock label="Terms" text={terms} /> : null}
          </div>
        ) : null}
        {footer ? (
          <p className="border-t pt-4 text-xs whitespace-pre-line text-muted-foreground">
            {footer}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <>
      <dt className={strong ? "font-medium" : "text-muted-foreground"}>
        {label}
      </dt>
      <dd className={`text-right tabular-nums ${strong ? "font-medium" : ""}`}>
        {value}
      </dd>
    </>
  )
}

function Party({
  label,
  party,
}: {
  label: string
  party: PartySnapshot | null
}) {
  return (
    <div className="text-sm">
      <p className="mb-1 text-xs text-muted-foreground uppercase">{label}</p>
      {party ? (
        <>
          <p className="font-medium">{party.legalName || party.name}</p>
          {party.addressLines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          {party.email ? <p>{party.email}</p> : null}
          {party.phone ? <p>{party.phone}</p> : null}
          {party.taxId ? (
            <p className="text-muted-foreground">Tax ID {party.taxId}</p>
          ) : null}
        </>
      ) : (
        <Skeleton className="h-16 w-40" />
      )}
    </div>
  )
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground uppercase">{label}</p>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  )
}
