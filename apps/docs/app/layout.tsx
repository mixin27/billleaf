import { Inter } from "next/font/google"
import { Provider } from "@/components/provider"
import type { Metadata } from "next"
import "./global.css"

export const metadata: Metadata = {
  title: { default: "Billleaf docs", template: "%s · Billleaf docs" },
  description:
    "Guides for Billleaf (quotes, contracts, time, invoices, payments, expenses) and the developer API.",
}

const inter = Inter({
  subsets: ["latin"],
})

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
