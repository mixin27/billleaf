import type { Metadata } from "next"

import { RatesSettings } from "@/features/time"

export const metadata: Metadata = { title: "Rates" }

export default function RatesPage() {
  return <RatesSettings />
}
