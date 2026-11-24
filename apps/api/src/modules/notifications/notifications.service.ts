import { InjectQueue } from "@nestjs/bullmq"
import { Injectable, Logger } from "@nestjs/common"
import {
  type NotificationSettings,
  PUSH_TYPES,
  type PushType,
  type RegisterPushDeviceInput,
} from "@workspace/contracts"
import { clients, organization } from "@workspace/db"
import type { Queue } from "bullmq"
import { and, eq } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { QUEUES } from "../../core/queue/queue.module.js"
import { NotificationsRepository } from "./notifications.repository.js"
import {
  isPushEvent,
  permissionFor,
  type ProofEvent,
  pushContent,
} from "./push-messages.js"

/** What the worker sends: one message per token. */
export interface PushJob {
  type: PushType
  title: string
  body: string
  data: {
    type: PushType
    path: string | null
    workspace: { id: string; slug: string; name: string }
  }
  tokens: string[]
}

export const PUSH_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 30_000 },
}

/**
 * Push notifications: devices and per-user choices, and `notify`, which
 * turns a domain event into one queued push for the members who should
 * see it (ADR-0018).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly repo: NotificationsRepository,
    @InjectQueue(QUEUES.push) private readonly queue: Queue
  ) {}

  registerDevice(userId: string, input: RegisterPushDeviceInput) {
    return this.repo.upsertDevice(userId, input)
  }

  removeDevice(userId: string, token: string) {
    return this.repo.deleteDevice(userId, token)
  }

  async settings(userId: string): Promise<NotificationSettings> {
    const rows = await this.repo.settings(userId)
    const off = new Set(rows.filter((r) => !r.enabled).map((r) => r.type))
    return {
      items: PUSH_TYPES.map((t) => ({
        type: t.type,
        label: t.label,
        enabled: !off.has(t.type),
      })),
    }
  }

  async setSetting(userId: string, type: PushType, enabled: boolean) {
    await this.repo.setSetting(userId, type, enabled)
    return this.settings(userId)
  }

  /**
   * Queue a push for `event` to the members who can see it (or, for your
   * own week, to you alone), except the one who did it (portal actions
   * have no member, so everyone is told). Call
   * after the change is committed. Never throws.
   */
  async notify(event: string, object: unknown): Promise<void> {
    if (!isPushEvent(event)) return
    try {
      const workspaceId = this.ctx.workspaceId
      let subject = object
      if (event === "payment_proof.submitted") {
        // The portal's event has the client id, not the name.
        const p = object as ProofEvent & { clientId?: string }
        if (p.clientId && !p.clientName) {
          const [c] = await this.db
            .select({ name: clients.name })
            .from(clients)
            .where(
              and(
                eq(clients.workspaceId, workspaceId),
                eq(clients.id, p.clientId)
              )
            )
          subject = { ...p, clientName: c?.name ?? null }
        }
      }
      const content = pushContent(event, subject)
      if (!content) return
      const recipients = await this.repo.recipients({
        workspaceId,
        permission: permissionFor(content.type),
        type: content.type,
        excludeUserId: this.ctx.optionalUserId,
        memberId: content.memberId,
      })
      if (!recipients.length) return
      const [ws] = await this.db
        .select({
          id: organization.id,
          slug: organization.slug,
          name: organization.name,
        })
        .from(organization)
        .where(eq(organization.id, workspaceId))
      if (!ws) return
      const job: PushJob = {
        type: content.type,
        title: content.title,
        body: content.body,
        data: { type: content.type, path: content.path, workspace: ws },
        tokens: [...new Set(recipients.map((r) => r.token))],
      }
      await this.queue.add("send", job, PUSH_JOB_OPTS)
    } catch (err) {
      this.logger.error({ err, event }, "Couldn't queue a push notification")
    }
  }
}
