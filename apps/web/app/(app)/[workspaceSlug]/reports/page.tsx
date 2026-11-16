import type { Metadata } from "next"

import { ProfitLossReport } from "@/features/expenses"

export const metadata: Metadata = { title: "Reports" }

export default function ReportsPage() {
  return <ProfitLossReport />
}
