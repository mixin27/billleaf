import type { Metadata } from "next"

import { WebhookDetail } from "@/features/webhooks"

export const metadata: Metadata = { title: "Webhook" }

export default async function WebhookPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <WebhookDetail id={id} />
}
