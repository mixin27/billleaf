"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import QRCode from "qrcode"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { authClient, useSession } from "@/lib/auth-client"

type Setup = { uri: string; secret: string; qr: string; backupCodes: string[] }

/**
 * Two-factor authentication with an authenticator app (TOTP). Required for
 * platform admins; recommended for workspace owners.
 */
export function TwoFactorSettings() {
  const session = useSession()
  const enabled = Boolean(
    (session.data?.user as { twoFactorEnabled?: boolean } | undefined)
      ?.twoFactorEnabled
  )
  const [password, setPassword] = React.useState("")
  const [setup, setSetup] = React.useState<Setup | null>(null)
  const [code, setCode] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [disabling, setDisabling] = React.useState(false)

  const start = async () => {
    setPending(true)
    const { data, error } = await authClient.twoFactor.enable({ password })
    setPending(false)
    if (error || !data || data.method !== "totp")
      return void toast.error(error?.message ?? "Couldn't start")
    const uri = data.totpURI
    const secret = new URL(uri).searchParams.get("secret") ?? ""
    setSetup({
      uri,
      secret,
      qr: await QRCode.toDataURL(uri, { margin: 1, width: 200 }),
      backupCodes: data.backupCodes,
    })
    setPassword("")
  }

  const verify = async () => {
    setPending(true)
    const { error } = await authClient.twoFactor.verifyTotp({
      code: code.replace(/\s/g, ""),
    })
    setPending(false)
    if (error) return void toast.error(error.message ?? "That code didn't work")
    toast.success("Two-factor authentication is on")
    setSetup(null)
    setCode("")
    await session.refetch()
  }

  const disable = async () => {
    setPending(true)
    const { error } = await authClient.twoFactor.disable({ password })
    setPending(false)
    if (error) return void toast.error(error.message ?? "Couldn't turn it off")
    toast.success("Two-factor authentication is off")
    setDisabling(false)
    setPassword("")
    await session.refetch()
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold">Two-factor authentication</p>
          <Badge variant={enabled ? "default" : "secondary"}>
            {enabled ? "On" : "Off"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Sign-ins also ask for a code from an authenticator app (Google
          Authenticator, 1Password, Authy…). Required for platform admins.
        </p>

        {setup ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
              <img
                src={setup.qr}
                alt="Scan with your authenticator app"
                className="size-40 rounded-md border bg-white p-1"
              />
              <div className="min-w-0 flex-1 text-sm">
                <p>1. Scan the QR code with your authenticator app.</p>
                <p className="mt-1 text-muted-foreground">
                  Can't scan? Enter this key:{" "}
                  <span className="font-mono break-all text-foreground">
                    {setup.secret}
                  </span>
                </p>
                <a className="mt-1 inline-block underline" href={setup.uri}>
                  Open in an authenticator app on this device
                </a>
              </div>
            </div>
            <div className="text-sm">
              <p>2. Save these backup codes somewhere safe. Each works once.</p>
              <pre className="mt-2 grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-3 font-mono text-xs sm:grid-cols-5">
                {setup.backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </pre>
            </div>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void verify()
              }}
            >
              <Field label="3. Enter the 6-digit code" htmlFor="tf-code">
                <Input
                  id="tf-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-40"
                />
              </Field>
              <Button type="submit" disabled={pending || !code.trim()}>
                Turn on
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSetup(null)}
              >
                Cancel
              </Button>
            </form>
          </div>
        ) : !enabled || disabling ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void (enabled ? disable() : start())
            }}
          >
            <Field label="Your password" htmlFor="tf-password">
              <Input
                id="tf-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-56"
              />
            </Field>
            <Button
              type="submit"
              variant={enabled ? "destructive" : "default"}
              disabled={pending || !password}
            >
              {enabled ? "Turn off" : "Set up"}
            </Button>
            {disabling ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDisabling(false)}
              >
                Cancel
              </Button>
            ) : null}
          </form>
        ) : (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => setDisabling(true)}
          >
            Turn off
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
