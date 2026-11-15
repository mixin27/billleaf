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

import { signIn } from "@/lib/auth-client"

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
    rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/"
  const form = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await signIn.email(values)
    if (error) {
      toast.error(error.message ?? "Sign in failed")
      return
    }
    router.push(next)
  })

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
          <Label htmlFor="password">Password</Label>
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
