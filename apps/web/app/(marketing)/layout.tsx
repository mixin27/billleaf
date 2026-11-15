import { MarketingShell } from "@/features/marketing"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MarketingShell>{children}</MarketingShell>
}
