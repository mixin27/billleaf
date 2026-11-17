"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { authClient, signIn } from "@/lib/auth-client"

import { AuthCard } from "./auth-card"

const schema = z.object({
  email: z.email(),
  password: z.string().min(1, "Required"),
})
type Values = z.infer<typeof schema>

export function SignInForm() {
  const router = useRouter()
  const rawNext = useSearchParams().get("next")
  // Only same-origin relative paths, never protocol-relative URLs.
  const next =
    rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app"
  const form = useForm<Values>({ resolver: zodResolver(schema) })
  const [needsCode, setNeedsCode] = React.useState(false)

  const onSubmit = form.handleSubmit(async (values) => {
    const { data, error } = await signIn.email(values)
    if (error) {
      toast.error(error.message ?? "Sign in failed")
      return
    }
    // Accounts with two-factor authentication get a second step.
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setNeedsCode(true)
      return
    }
    router.push(next)
  })

  if (needsCode) return <TwoFactorStep onDone={() => router.push(next)} />

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back to Billleaf."
      footer={
        <>
          No account?{" "}
          <Link
            href={
              next !== "/"
                ? `/sign-up?next=${encodeURIComponent(next)}`
                : "/sign-up"
            }
            className="underline"
          >
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...form.register("email")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href={`/forgot-password${form.watch("email") ? `?email=${encodeURIComponent(form.watch("email"))}` : ""}`}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
          />
        </div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  )
}

/** Second sign-in step: a code from the authenticator app, or a backup code. */
function TwoFactorStep({ onDone }: { onDone: () => void }) {
  const [code, setCode] = React.useState("")
  const [backup, setBackup] = React.useState(false)
  const [trust, setTrust] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  return (
    <AuthCard
      title="Two-factor authentication"
      description={
        backup
          ? "Enter one of your backup codes."
          : "Enter the 6-digit code from your authenticator app."
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setPending(true)
          const { error } = backup
            ? await authClient.twoFactor.verifyBackupCode({
                code: code.trim(),
                trustDevice: trust,
              })
            : await authClient.twoFactor.verifyTotp({
                code: code.replace(/\s/g, ""),
                trustDevice: trust,
              })
          setPending(false)
          if (error) {
            toast.error(error.message ?? "That code didn't work")
            return
          }
          onDone()
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="otp">{backup ? "Backup code" : "Code"}</Label>
          <Input
            id="otp"
            autoFocus
            autoComplete="one-time-code"
            inputMode={backup ? "text" : "numeric"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={trust}
            onChange={(e) => setTrust(e.target.checked)}
          />
          Trust this device for 30 days
        </label>
        <Button type="submit" disabled={pending || !code.trim()}>
          Verify
        </Button>
        <Button
          type="button"
          variant="link"
          className="px-0"
          onClick={() => {
            setBackup((b) => !b)
            setCode("")
          }}
        >
          {backup ? "Use the authenticator app instead" : "Use a backup code"}
        </Button>
      </form>
    </AuthCard>
  )
}
