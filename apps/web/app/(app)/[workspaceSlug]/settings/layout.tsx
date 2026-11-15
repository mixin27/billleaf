import { SettingsNav } from "@/components/layout/settings-nav"
import { PageHeader } from "@/components/page-header"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <SettingsNav />
      {children}
    </div>
  )
}
