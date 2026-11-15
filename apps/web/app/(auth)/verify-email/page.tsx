import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "Check your email" }

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  return (
    <div className="max-w-sm text-center text-sm">
      <h1 className="mb-2 text-lg font-medium">Check your email</h1>
      <p className="text-muted-foreground">
        We sent a verification link{email ? ` to ${email}` : ""}. Open it to
        finish creating your account.
      </p>
      <Link href="/sign-in" className="mt-6 inline-block underline">
        Back to sign in
      </Link>
    </div>
  )
}
