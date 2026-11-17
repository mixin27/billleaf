"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { authClient } from "@/lib/auth-client"
import { env } from "@/lib/env"

import { AuthCard } from "./auth-card"

const MIN_PASSWORD = 10

/** Ask for a reset link. Always says "check your email" (no account probing). */
export function ForgotPasswordForm() {
  const params = useSearchParams()
  const [email, setEmail] = React.useState(params.get("email") ?? "")
  const [pending, setPending] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  if (sent)
    return (
      <AuthCard
        title="Check your email"
        description={`If ${email} has a Billleaf account, we've sent a link to choose a new password. It works for an hour.`}
        footer={
          <Link href="/sign-in" className="underline">
            Back to sign in
          </Link>
        }
      >
        <Button variant="outline" onClick={() => setSent(false)}>
          Use a different email
        </Button>
      </AuthCard>
    )

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your account's email and we'll send you a link to choose a new password."
      footer={
        <Link href="/sign-in" className="underline">
          Back to sign in
        </Link>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setPending(true)
          const { error } = await authClient.requestPasswordReset({
            email: email.trim(),
            redirectTo: `${env.NEXT_PUBLIC_APP_URL}/reset-password`,
          })
          setPending(false)
          // Rate limits and outages are worth showing; unknown emails aren't.
          if (error && (error.status ?? 0) >= 429) {
            toast.error(error.message ?? "Couldn't send the email")
            return
          }
          setSent(true)
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending || !email.trim()}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  )
}

/** Choose a new password from the emailed link (`?token=` or `?error=`). */
export function ResetPasswordForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get("token")
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [pending, setPending] = React.useState(false)

  if (!token || params.get("error"))
    return (
      <AuthCard
        title="This link has expired"
        description="Reset links work once and for an hour. Ask for a new one."
      >
        <Button nativeButton={false} render={<Link href="/forgot-password" />}>
          Send a new link
        </Button>
      </AuthCard>
    )

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && confirm !== password

  return (
    <AuthCard
      title="Choose a new password"
      description={`At least ${MIN_PASSWORD} characters. You'll be signed out on your other devices.`}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (password.length < MIN_PASSWORD || password !== confirm) return
          setPending(true)
          const { error } = await authClient.resetPassword({
            newPassword: password,
            token,
          })
          setPending(false)
          if (error) {
            toast.error(error.message ?? "Couldn't reset the password")
            return
          }
          toast.success("Password changed. Sign in with your new password.")
          router.push("/sign-in")
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={tooShort || undefined}
          />
          {tooShort ? (
            <p className="text-xs text-destructive">
              Use at least {MIN_PASSWORD} characters.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch || undefined}
          />
          {mismatch ? (
            <p className="text-xs text-destructive">
              The passwords don&apos;t match.
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          disabled={
            pending || password.length < MIN_PASSWORD || password !== confirm
          }
        >
          {pending ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </AuthCard>
  )
}
