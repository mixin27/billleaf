import { Inject, Injectable } from "@nestjs/common"
import { organization, portalTokens } from "@workspace/db"
import { eq } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { ENV, type Env } from "../../core/config/env.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { LINK_TTL_MS, newPortalToken } from "./portal-tokens.js"

/**
 * Portal links for document emails: a reusable token (14 days) that signs the
 * recipient into that client's portal and opens the document.
 */
@Injectable()
export class PortalLinksService {
  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly ctx: RequestContext
  ) {}

  async documentLink(
    clientId: string,
    email: string,
    path: string
  ): Promise<string> {
    const { token, hash } = newPortalToken()
    await this.db.insert(portalTokens).values({
      workspaceId: this.ctx.workspaceId,
      clientId,
      email: email.trim().toLowerCase(),
      kind: "link",
      tokenHash: hash,
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
    })
    const [ws] = await this.db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, this.ctx.workspaceId))
      .limit(1)
    return portalUrl(this.env.WEB_URL, ws!.slug, token, path)
  }
}

export function portalUrl(
  webUrl: string,
  slug: string,
  token: string,
  next?: string
) {
  const q = new URLSearchParams({ token })
  if (next) q.set("next", next)
  return `${webUrl}/portal/${encodeURIComponent(slug)}/auth?${q.toString()}`
}
