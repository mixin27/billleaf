import { describe, expect, it, vi } from "vitest"

import {
  PushDeliveryService,
  RECEIPT_DELAY_MS,
} from "./push-delivery.service.js"
import type { PushProvider } from "./push.provider.js"

const job = {
  type: "quote.answered" as const,
  title: "Northwind accepted QUO-0001",
  body: "$480.00",
  data: {
    type: "quote.answered" as const,
    path: "/quote/q1",
    workspace: { id: "w1", slug: "w", name: "W" },
  },
  tokens: ["ok-token", "gone-token", "rate-token"],
}

function setup(provider: Partial<PushProvider>) {
  const repo = { deleteTokens: vi.fn().mockResolvedValue(1) }
  const queue = { add: vi.fn() }
  const service = new PushDeliveryService(
    provider as PushProvider,
    repo as never,
    queue as never
  )
  return { service, repo, queue }
}

describe("PushDeliveryService", () => {
  it("sends one message per token, forgets gone tokens and checks receipts later", async () => {
    const send = vi.fn().mockResolvedValue([
      { token: "ok-token", id: "r1" },
      { token: "gone-token", error: "DeviceNotRegistered" },
      { token: "rate-token", error: "MessageRateExceeded" },
    ])
    const { service, repo, queue } = setup({ send })
    await service.send(job)
    expect(send.mock.calls[0]![0]).toHaveLength(3)
    expect(send.mock.calls[0]![0][0]).toMatchObject({
      to: "ok-token",
      title: job.title,
      data: { path: "/quote/q1" },
    })
    expect(repo.deleteTokens).toHaveBeenCalledWith(["gone-token"])
    expect(queue.add).toHaveBeenCalledWith(
      "receipts",
      { tickets: [{ id: "r1", token: "ok-token" }] },
      expect.objectContaining({ delay: RECEIPT_DELAY_MS })
    )
  })

  it("forgets tokens whose receipts say the app is gone", async () => {
    const receipts = vi.fn().mockResolvedValue({
      r1: {},
      r2: { error: "DeviceNotRegistered" },
    })
    const { service, repo } = setup({ receipts })
    await service.checkReceipts([
      { id: "r1", token: "a" },
      { id: "r2", token: "b" },
    ])
    expect(repo.deleteTokens).toHaveBeenCalledWith(["b"])
  })
})
