"use client"

import { E_SIGN_CONSENT } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { errorMessage } from "@/lib/api"

import {
  useAcceptQuote,
  useDeclineContract,
  useDeclineQuote,
  useSignContract,
} from "../api/queries"

/** "Decline" with an optional reason, shared by quotes and contracts. */
function DeclineForm({
  what,
  pending,
  onDecline,
  onCancel,
}: {
  what: string
  pending: boolean
  onDecline: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = React.useState("")
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onDecline(reason)
      }}
    >
      <Field
        label={`Why are you declining this ${what}?`}
        htmlFor="decline-reason"
        hint="Optional. It helps them send something that works for you."
      >
        <Textarea
          id="decline-reason"
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          Decline {what}
        </Button>
      </div>
    </form>
  )
}

/** Accept (typed name) or decline a sent quote. */
export function QuoteResponse({
  slug,
  id,
  businessName,
}: {
  slug: string
  id: string
  businessName: string
}) {
  const accept = useAcceptQuote(slug, id)
  const decline = useDeclineQuote(slug, id)
  const [name, setName] = React.useState("")
  const [declining, setDeclining] = React.useState(false)
  const onError = (e: unknown) => toast.error(errorMessage(e))

  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-col gap-4">
        {declining ? (
          <DeclineForm
            what="quote"
            pending={decline.isPending}
            onCancel={() => setDeclining(false)}
            onDecline={(reason) =>
              decline.mutate(reason, {
                onSuccess: () => toast.success("Quote declined"),
                onError,
              })
            }
          />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              accept.mutate(name, {
                onSuccess: () =>
                  toast.success(`Accepted. ${businessName} has been told.`),
                onError,
              })
            }}
          >
            <div>
              <p className="text-base font-semibold">Accept this quote?</p>
              <p className="text-sm text-muted-foreground">
                Type your name to accept it. {businessName} will be notified.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field
                label="Your full name"
                htmlFor="accept-name"
                className="flex-1"
              >
                <Input
                  id="accept-name"
                  autoComplete="name"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Button
                type="submit"
                disabled={accept.isPending || name.trim().length < 2}
              >
                Accept quote
              </Button>
            </div>
            <Button
              type="button"
              variant="link"
              className="self-start px-0 text-muted-foreground"
              onClick={() => setDeclining(true)}
            >
              Decline instead
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

/** Typed-name e-signature, or decline, for a sent contract. */
export function ContractSigning({ slug, id }: { slug: string; id: string }) {
  const sign = useSignContract(slug, id)
  const decline = useDeclineContract(slug, id)
  const [name, setName] = React.useState("")
  const [agree, setAgree] = React.useState(false)
  const [declining, setDeclining] = React.useState(false)
  const onError = (e: unknown) => toast.error(errorMessage(e))

  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-col gap-4">
        {declining ? (
          <DeclineForm
            what="contract"
            pending={decline.isPending}
            onCancel={() => setDeclining(false)}
            onDecline={(reason) =>
              decline.mutate(reason, {
                onSuccess: () => toast.success("Contract declined"),
                onError,
              })
            }
          />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              sign.mutate(name, {
                onSuccess: () =>
                  toast.success("Signed. We’ve emailed you a signed copy."),
                onError,
              })
            }}
          >
            <div>
              <p className="text-base font-semibold">Sign this contract</p>
              <p className="text-sm text-muted-foreground">
                Read the contract above, then type your full name to sign.
              </p>
            </div>
            <Field label="Your full name" htmlFor="sign-name">
              <Input
                id="sign-name"
                autoComplete="name"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            {name.trim().length >= 2 ? (
              <p
                className="text-2xl text-foreground italic"
                style={{
                  fontFamily: "'Brush Script MT', 'Segoe Script', cursive",
                }}
                aria-hidden
              >
                {name}
              </p>
            ) : null}
            <div className="flex items-start gap-2">
              <Checkbox
                id="sign-agree"
                checked={agree}
                onCheckedChange={(v) => setAgree(Boolean(v))}
                className="mt-0.5"
              />
              <Label
                htmlFor="sign-agree"
                className="text-sm leading-snug font-normal"
              >
                {E_SIGN_CONSENT}
              </Label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="link"
                className="px-0 text-muted-foreground"
                onClick={() => setDeclining(true)}
              >
                Decline instead
              </Button>
              <Button
                type="submit"
                disabled={sign.isPending || !agree || name.trim().length < 2}
              >
                Sign contract
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              We record your name, email, the time, your IP address and device
              with a fingerprint of this contract, and add them to the signed
              PDF.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
