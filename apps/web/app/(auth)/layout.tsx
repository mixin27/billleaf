import { Logo } from "@workspace/brand/logo"
import Link from "next/link"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 p-6">
      <Link href="/" aria-label="billleaf home">
        <Logo height={40} />
      </Link>
      {children}
    </div>
  )
}
