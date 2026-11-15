import Link from "next/link"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 p-6">
      <Link href="/" className="text-xl font-semibold tracking-tight">
        billleaf
      </Link>
      {children}
    </div>
  )
}
