import { Button } from "@workspace/ui/components/button"
import Link from "next/link"

import { siteConfig } from "@/config/site"

/** Header and footer for the public pages (home, pricing, legal). */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            billleaf
          </Link>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/pricing" />}
            >
              Pricing
            </Button>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/sign-in" />}
            >
              Sign in
            </Button>
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/sign-up" />}
            >
              Start free
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:px-6">
          <p>
            © {new Date().getFullYear()} {siteConfig.name}
          </p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto">
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            {siteConfig.supportEmail ? (
              <a
                href={`mailto:${siteConfig.supportEmail}`}
                className="hover:text-foreground"
              >
                Contact
              </a>
            ) : null}
          </nav>
        </div>
      </footer>
    </div>
  )
}
