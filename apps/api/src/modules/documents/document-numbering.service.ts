import { Injectable } from "@nestjs/common"
import { documentSequences, type Transaction } from "@workspace/db"
import { and, eq, sql } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"

export type DocumentScope = "quote" | "invoice" | "receipt"

const DEFAULT_PREFIX: Record<DocumentScope, string> = {
  quote: "QUO-",
  invoice: "INV-",
  receipt: "RCT-",
}

/**
 * Gap-free, per-workspace document numbers. MUST be called inside the same
 * transaction that issues the document: the row lock taken by UPDATE …
 * RETURNING serialises concurrent issuers, and a rollback releases the number.
 */
@Injectable()
export class DocumentNumberingService {
  constructor(private readonly ctx: RequestContext) {}

  async next(tx: Transaction, scope: DocumentScope): Promise<string> {
    const workspaceId = this.ctx.workspaceId
    await tx
      .insert(documentSequences)
      .values({ workspaceId, scope, prefix: DEFAULT_PREFIX[scope] })
      .onConflictDoNothing()
    const [row] = await tx
      .update(documentSequences)
      .set({ nextValue: sql`${documentSequences.nextValue} + 1` })
      .where(
        and(
          eq(documentSequences.workspaceId, workspaceId),
          eq(documentSequences.scope, scope)
        )
      )
      .returning({
        value: sql<number>`${documentSequences.nextValue} - 1`,
        prefix: documentSequences.prefix,
        padding: documentSequences.padding,
      })
    return `${row!.prefix}${String(row!.value).padStart(row!.padding, "0")}`
  }
}
