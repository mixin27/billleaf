import { Landing, MarketingShell } from "@/features/marketing"

/** `/`: the public home page, for everyone (the app lives at /app). */
export default function HomePage() {
  return (
    <MarketingShell>
      <Landing />
    </MarketingShell>
  )
}
