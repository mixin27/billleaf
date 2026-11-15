"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { env } from "@/lib/env"
import { signUp } from "@/lib/auth-client"

import { AuthCard } from "./auth-card"

const schema = z.object({
  name: z.string().trim().min(2, "At least 2 characters"),
  email: z.email(),
  password: z.string().min(10, "At least 10 characters"),
})
type Values = z.infer<typeof schema>

export function SignUpForm() {
  const router = useRouter()
  const rawNext = useSearchParams().get("next")
  // Only same-origin relative paths, never protocol-relative URLs.
  const next =
    rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null
  const form = useForm<Values>({ resolver: zodResolver(schema) })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await signUp.email({
      ...values,
      callbackURL: `${env.NEXT_PUBLIC_APP_URL}${next ?? "/onboarding"}`,
    })
    if (error) {
      toast.error(error.message ?? "Sign up failed")
      return
    }
    router.push(`/verify-email?email=${encodeURIComponent(values.email)}`)
  })

  return (
    <AuthCard
      title="Create your account"
      description="Your work. Your business. One place."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={
              next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"
            }
            className="underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" autoComplete="name" {...form.register("name")} />
          {errors.name ? (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...form.register("email")}
          />
          {errors.email ? (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...form.register("password")}
          />
          {errors.password ? (
            <p className="text-xs text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By creating an account, you agree to the{" "}
          <Link href="/terms" className="underline" target="_blank">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline" target="_blank">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  )
}
