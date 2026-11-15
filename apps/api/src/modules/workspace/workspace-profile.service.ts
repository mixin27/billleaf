import { BadRequestException, Injectable } from "@nestjs/common"
import type {
  UpdateWorkspaceProfileInput,
  WorkspaceProfile,
} from "@workspace/contracts"

import { AuditService } from "../../iam/audit/audit.service.js"
import {
  type ProfileRow,
  WorkspaceProfileRepository,
} from "./workspace-profile.repository.js"

export function toProfileDto(r: ProfileRow): WorkspaceProfile {
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
    defaultTaxRateBps: r.defaultTaxRateBps,
    documentFooter: r.documentFooter,
    brandColor: r.brandColor,
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
    private readonly audit: AuditService
  ) {}

  async get(): Promise<WorkspaceProfile> {
    return toProfileDto(await this.repo.getOrCreate())
  }

  /** `input` is already parsed by the Zod pipe (transforms applied). */
  async update(input: Record<string, unknown>): Promise<WorkspaceProfile> {
    const { name, ...profile } = input as UpdateWorkspaceProfileInput & {
      name?: string
    }
    if (profile.timezone && !isValidTimeZone(profile.timezone)) {
      throw new BadRequestException("Unknown timezone")
    }
    const row = await this.repo.update(name, profile as never)
    await this.audit.record("workspace.profile_updated", {
      resourceType: "workspace",
      resourceId: row.workspaceId,
      metadata: { fields: Object.keys(input) },
    })
    return toProfileDto(row)
  }
}
