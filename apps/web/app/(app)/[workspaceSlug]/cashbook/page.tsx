import type { Metadata } from "next"

import { CashbookBooks } from "@/features/cashbook"

export const metadata: Metadata = { title: "Cashbook" }

export default function CashbookPage() {
  return <CashbookBooks />
}
