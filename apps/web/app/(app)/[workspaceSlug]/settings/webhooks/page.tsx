import type { Metadata } from "next"

import { WebhooksSettings } from "@/features/webhooks"

export const metadata: Metadata = { title: "Webhooks" }

export default function WebhooksPage() {
  return <WebhooksSettings />
}
