import { BadRequestException, Injectable } from "@nestjs/common"
import type {
  UpdateWorkspaceProfileInput,
  WorkspaceProfile,
} from "@workspace/contracts"

import { todayIn } from "../documents/party-snapshot.js"
import { EntitlementsService } from "../../billing/entitlements.service.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { FilesService } from "../files/files.service.js"

export const LOGO_MAX_BYTES = 1024 * 1024
import {
  type ProfileRow,
  WorkspaceProfileRepository,
} from "./workspace-profile.repository.js"

export function toProfileDto(
  r: ProfileRow,
  logoUrl: string | null = null
): WorkspaceProfile {
  return {
    workspaceId: r.workspaceId,
    name: r.name,
    slug: r.slug,
    legalName: r.legalName,
    email: r.email,
    phone: r.phone,
    website: r.website,
    taxId: r.taxId,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.city,
    state: r.state,
    postalCode: r.postalCode,
    country: r.country,
    defaultCurrency: r.defaultCurrency,
    timezone: r.timezone,
    locale: r.locale,
    paymentTermsDays: r.paymentTermsDays,
    invoiceReminderOffsets: r.invoiceReminderOffsets,
    timesheetApprovals: r.timesheetApprovals,
    timeRoundingMode: r.timeRoundingMode,
    timeRoundingMinutes: r.timeRoundingMinutes,
    timeLockedBefore: r.timeLockedBefore,
    defaultTaxRateBps: r.defaultTaxRateBps,
    documentFooter: r.documentFooter,
    brandColor: r.brandColor,
    logoUrl,
    updatedAt: r.updatedAt.toISOString(),
  }
}

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

@Injectable()
export class WorkspaceProfileService {
  constructor(
    private readonly repo: WorkspaceProfileRepository,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService
  ) {}

  async get(): Promise<WorkspaceProfile> {
    const row = await this.repo.getOrCreate()
    return toProfileDto(row, await this.files.url(row.logoFileId))
  }

  /** Raw logo bytes for documents (PDFs), or null. */
  /**
   * Logo, colour and footer for PDFs. Without the custom branding
   * entitlement, documents use the default look and a Billleaf credit.
   */
  async documentBranding(): Promise<{
    brandColor: string | null
    logo: Buffer | null
    footer: string | null
  }> {
    const profile = await this.get()
    if (await this.entitlements.hasFeature("customBranding")) {
      return {
        brandColor: profile.brandColor,
        logo: await this.logoImage(),
        footer: profile.documentFooter,
      }
    }
    return {
      brandColor: null,
      logo: null,
      footer: [profile.documentFooter, "Made with Billleaf"]
        .filter(Boolean)
        .join("  ·  "),
    }
  }

  async logoImage(): Promise<Buffer | null> {
    const row = await this.repo.getOrCreate()
    if (!row.logoFileId) return null
    try {
      return (await this.files.read(row.logoFileId)).body
    } catch {
      return null // a missing logo must never break document rendering
    }
  }

  async setLogo(filename: string, body: Buffer): Promise<WorkspaceProfile> {
    const previous = (await this.repo.getOrCreate()).logoFileId
    const file = await this.files.uploadImage(
      "logo",
      filename,
      body,
      LOGO_MAX_BYTES
    )
    await this.repo.update(undefined, { logoFileId: file.id })
    if (previous) await this.files.remove(previous)
    await this.audit.record("workspace.logo_updated", {
      resourceType: "file",
      resourceId: file.id,
    })
    return this.get()
  }

  async removeLogo(): Promise<WorkspaceProfile> {
    const previous = (await this.repo.getOrCreate()).logoFileId
    if (previous) {
      await this.repo.update(undefined, { logoFileId: null })
      await this.files.remove(previous)
      await this.audit.record("workspace.logo_removed", {
        resourceType: "file",
        resourceId: previous,
      })
    }
    return this.get()
  }

  /** `input` is already parsed by the Zod pipe (transforms applied). */
  async update(input: Record<string, unknown>): Promise<WorkspaceProfile> {
    const { name, ...profile } = input as UpdateWorkspaceProfileInput & {
      name?: string
    }
    if (profile.timezone && !isValidTimeZone(profile.timezone)) {
      throw new BadRequestException("Unknown timezone")
    }
    if (profile.timesheetApprovals === true)
      await this.entitlements.assertFeature("timesheetApprovals")
    if (profile.timeLockedBefore) {
      const tz = profile.timezone ?? (await this.repo.getOrCreate()).timezone
      if (profile.timeLockedBefore > todayIn(tz))
        throw new BadRequestException(
          "The lock date can't be after today (time before it is locked)"
        )
    }
    const row = await this.repo.update(name, profile as never)
    await this.audit.record("workspace.profile_updated", {
      resourceType: "workspace",
      resourceId: row.workspaceId,
      metadata: { fields: Object.keys(input) },
    })
    return toProfileDto(row, await this.files.url(row.logoFileId))
  }
}
