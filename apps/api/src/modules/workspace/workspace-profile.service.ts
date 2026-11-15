import { BadRequestException, Injectable } from "@nestjs/common"
import type {
  UpdateWorkspaceProfileInput,
  WorkspaceProfile,
} from "@workspace/contracts"

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
    private readonly audit: AuditService
  ) {}

  async get(): Promise<WorkspaceProfile> {
    const row = await this.repo.getOrCreate()
    return toProfileDto(row, await this.files.url(row.logoFileId))
  }

  /** Raw logo bytes for documents (PDFs), or null. */
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
    const row = await this.repo.update(name, profile as never)
    await this.audit.record("workspace.profile_updated", {
      resourceType: "workspace",
      resourceId: row.workspaceId,
      metadata: { fields: Object.keys(input) },
    })
    return toProfileDto(row, await this.files.url(row.logoFileId))
  }
}
