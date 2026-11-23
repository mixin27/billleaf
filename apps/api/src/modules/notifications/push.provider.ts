import { Logger } from "@nestjs/common"
import { Expo, type ExpoPushMessage } from "expo-server-sdk"

export const PUSH_PROVIDER = Symbol("PUSH_PROVIDER")

export interface PushMessage {
  to: string
  title: string
  body: string
  data: Record<string, unknown>
}

/** One per message, in order: a receipt id to check later, or why it failed. */
export interface PushTicket {
  token: string
  id?: string
  /** e.g. "DeviceNotRegistered": the token is gone. */
  error?: string
}

/**
 * Where pushes go (ADR-0018). Expo's service today; a direct APNs/FCM
 * adapter would implement the same two calls.
 */
export interface PushProvider {
  send(messages: PushMessage[]): Promise<PushTicket[]>
  /** Delivery results for earlier tickets, by id: ok or an error code. */
  receipts(ids: string[]): Promise<Record<string, { error?: string }>>
}

/** Sends through Expo's push service (free; 600 per second per project). */
export class ExpoPushProvider implements PushProvider {
  private readonly expo: Expo

  constructor(accessToken?: string) {
    this.expo = new Expo(accessToken ? { accessToken } : {})
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = []
    const valid = messages.filter((m) => {
      if (Expo.isExpoPushToken(m.to)) return true
      tickets.push({ token: m.to, error: "DeviceNotRegistered" })
      return false
    })
    const expoMessages: ExpoPushMessage[] = valid.map((m) => ({
      to: m.to,
      title: m.title,
      body: m.body,
      data: m.data,
      sound: "default",
      priority: "high",
      channelId: "activity",
    }))
    for (const chunk of this.expo.chunkPushNotifications(expoMessages)) {
      const result = await this.expo.sendPushNotificationsAsync(chunk)
      result.forEach((t, i) => {
        const token = String(chunk[i]!.to)
        tickets.push(
          t.status === "ok"
            ? { token, id: t.id }
            : { token, error: t.details?.error ?? t.message }
        )
      })
    }
    return tickets
  }

  async receipts(ids: string[]) {
    const out: Record<string, { error?: string }> = {}
    for (const chunk of this.expo.chunkPushNotificationReceiptIds(ids)) {
      const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk)
      for (const [id, r] of Object.entries(receipts))
        out[id] =
          r.status === "ok" ? {} : { error: r.details?.error ?? r.message }
    }
    return out
  }
}

/** Development and CI: writes pushes to the log, and keeps them for tests. */
export class LogPushProvider implements PushProvider {
  private readonly logger = new Logger("Push")
  readonly sent: PushMessage[] = []

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    for (const m of messages) {
      this.sent.push(m)
      this.logger.log(`→ ${m.to}: ${m.title} — ${m.body}`)
    }
    return messages.map((m) => ({ token: m.to }))
  }

  async receipts() {
    return {}
  }
}
