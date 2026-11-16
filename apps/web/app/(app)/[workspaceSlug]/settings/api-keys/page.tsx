import type { Metadata } from "next"

import { ApiKeysSettings } from "@/features/developer"

export const metadata: Metadata = { title: "API keys" }

export default function ApiKeysPage() {
  return <ApiKeysSettings />
}
