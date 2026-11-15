export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 p-6">
      <p className="text-xl font-semibold tracking-tight">billleaf</p>
      {children}
    </div>
  )
}
