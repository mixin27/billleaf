import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common"
import { ApiParam, ApiTags } from "@nestjs/swagger"
import { Throttle } from "@nestjs/throttler"
import { AllowAnonymous } from "@thallesp/nestjs-better-auth"
import {
  portalContractListSchema,
  portalContractSchema,
  portalInvoiceListSchema,
  portalInvoiceSchema,
  portalMeSchema,
  portalQuoteListSchema,
  portalQuoteSchema,
  portalReceiptListSchema,
  portalSessionCreateSchema,
  portalSessionSchema,
  portalSignInSchema,
  portalWorkspaceSchema,
} from "@workspace/contracts"
import type { FastifyReply, FastifyRequest } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { ENV, type Env } from "../../core/config/env.js"
import { PortalGuard } from "./portal.guard.js"
import { PortalService } from "./portal.service.js"
import {
  PORTAL_COOKIE,
  portalCookie,
  readCookie,
  SESSION_TTL_MS,
} from "./portal-tokens.js"

class PortalWorkspaceDto extends createZodDto(portalWorkspaceSchema) {}
class PortalSignInDto extends createZodDto(portalSignInSchema) {}
class PortalSessionCreateDto extends createZodDto(portalSessionCreateSchema) {}
class PortalSessionDto extends createZodDto(portalSessionSchema) {}
class PortalMeDto extends createZodDto(portalMeSchema) {}
class PortalQuoteListDto extends createZodDto(portalQuoteListSchema) {}
class PortalQuoteDto extends createZodDto(portalQuoteSchema) {}
class PortalInvoiceListDto extends createZodDto(portalInvoiceListSchema) {}
class PortalInvoiceDto extends createZodDto(portalInvoiceSchema) {}
class PortalContractListDto extends createZodDto(portalContractListSchema) {}
class PortalContractDto extends createZodDto(portalContractSchema) {}
class PortalReceiptListDto extends createZodDto(portalReceiptListSchema) {}

const uuid = new ParseUUIDPipe()

/**
 * Client portal. No member session: public routes (branding, sign-in, session
 * exchange) and routes guarded by the portal cookie (PortalGuard).
 */
@ApiTags("portal")
@Controller({ path: "portal", version: "1" })
@AllowAnonymous()
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    @Inject(ENV) private readonly env: Env
  ) {}

  private cookie(value: string, maxAgeSeconds: number) {
    return portalCookie(value, {
      maxAgeSeconds,
      secure:
        this.env.NODE_ENV === "production" ||
        this.env.API_URL.startsWith("https:"),
      domain: this.env.COOKIE_DOMAIN || undefined,
    })
  }

  /** Exchange an emailed token for a portal session cookie. */
  @Post("session")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ZodResponse({ status: 200, type: PortalSessionDto })
  async session(
    @Body() body: PortalSessionCreateDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const s = await this.portal.createSession(body.token, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    })
    if (!s)
      throw new UnauthorizedException({
        message:
          "This link has expired or was already used. Ask for a new one.",
        code: "portal_link_invalid",
      })
    void reply.header(
      "set-cookie",
      this.cookie(s.sessionToken, SESSION_TTL_MS / 1000)
    )
    return { workspaceSlug: s.workspaceSlug }
  }

  @Post("sign-out")
  @HttpCode(204)
  async signOut(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    await this.portal.signOut(readCookie(req.headers.cookie, PORTAL_COOKIE))
    void reply.header("set-cookie", this.cookie("", 0))
  }

  @Get(":slug")
  @ZodResponse({ status: 200, type: PortalWorkspaceDto })
  workspace(@Param("slug") slug: string) {
    return this.portal.workspace(slug)
  }

  /** Always 202, whether or not the email belongs to a client. */
  @Post(":slug/sign-in")
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async signIn(@Param("slug") slug: string, @Body() body: PortalSignInDto) {
    await this.portal.requestSignIn(slug, body.email)
  }

  @Get(":slug/me")
  @UseGuards(PortalGuard)
  @ApiParam({ name: "slug", type: String })
  @ZodResponse({ status: 200, type: PortalMeDto })
  me() {
    return this.portal.me()
  }

  @Get(":slug/quotes")
  @UseGuards(PortalGuard)
  @ApiParam({ name: "slug", type: String })
  @ZodResponse({ status: 200, type: PortalQuoteListDto })
  async quotes() {
    return { items: await this.portal.listQuotes() }
  }

  @Get(":slug/quotes/:id")
  @UseGuards(PortalGuard)
  @ApiParam({ name: "slug", type: String })
  @ZodResponse({ status: 200, type: PortalQuoteDto })
  quote(@Param("id", uuid) id: string) {
    return this.portal.quote(id)
  }

  @Get(":slug/invoices")
  @UseGuards(PortalGuard)
  @ApiParam({ name: "slug", type: String })
  @ZodResponse({ status: 200, type: PortalInvoiceListDto })
  async invoices() {
    return { items: await this.portal.listInvoices() }
  }

  @Get(":slug/invoices/:id")
  @UseGuards(PortalGuard)
  @ApiParam({ name: "slug", type: String })
  @ZodResponse({ status: 200, type: PortalInvoiceDto })
  invoice(@Param("id", uuid) id: string) {
    return this.portal.invoice(id)
  }

  @Get(":slug/contracts")
  @UseGuards(PortalGuard)
  @ApiParam({ name: "slug", type: String })
  @ZodResponse({ status: 200, type: PortalContractListDto })
  async contracts() {
    return { items: await this.portal.listContracts() }
  }

  @Get(":slug/contracts/:id")
  @UseGuards(PortalGuard)
  @ApiParam({ name: "slug", type: String })
  @ZodResponse({ status: 200, type: PortalContractDto })
  contract(@Param("id", uuid) id: string) {
    return this.portal.contract(id)
  }

  @Get(":slug/receipts")
  @UseGuards(PortalGuard)
  @ApiParam({ name: "slug", type: String })
  @ZodResponse({ status: 200, type: PortalReceiptListDto })
  async receipts() {
    return { items: await this.portal.listReceipts() }
  }

  /** PDF of a quote, invoice, contract or receipt (`kind` = payment). */
  @Get(":slug/:kind/:id/pdf")
  @UseGuards(PortalGuard)
  @ApiParam({ name: "slug", type: String })
  @Header("cache-control", "private, no-store")
  async pdf(
    @Param("kind") kind: string,
    @Param("id", uuid) id: string,
    @Res() reply: FastifyReply
  ) {
    const map = {
      quotes: "quote",
      invoices: "invoice",
      contracts: "contract",
      receipts: "payment",
    } as const
    const k = map[kind as keyof typeof map]
    if (!k) return void reply.code(404).send()
    const { filename, content } = await this.portal.pdf(k, id)
    void reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `inline; filename="${filename}"`)
      .send(content)
  }
}
