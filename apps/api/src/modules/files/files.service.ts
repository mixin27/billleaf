import { EntitlementsService } from "../../billing/entitlements.service.js"
import { UsageService } from "../../billing/usage.service.js"
import { randomUUID } from "node:crypto"

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { files } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { StorageService } from "../../core/storage/storage.service.js"

export type FileRow = typeof files.$inferSelect
export type FilePurpose = FileRow["purpose"]

/** Detect the real image type from magic bytes (never trust the client's content-type). */
export function sniffImage(
  buf: Buffer
): { contentType: string; ext: string } | null {
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { contentType: "image/png", ext: "png" }
  }
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return { contentType: "image/jpeg", ext: "jpg" }
  }
  return null
}

/** A PDF by its header (`%PDF-`). */
export function sniffPdf(buf: Buffer) {
  return buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-"
    ? { contentType: "application/pdf", ext: "pdf" }
    : null
}

/** Workspace-scoped file metadata + bytes in object storage. */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
    private readonly ctx: RequestContext,
    private readonly usage: UsageService,
    private readonly entitlements: EntitlementsService
  ) {}

  async uploadImage(
    purpose: FilePurpose,
    filename: string,
    body: Buffer,
    maxBytes: number,
    opts: { allowPdf?: boolean } = {}
  ): Promise<FileRow> {
    if (body.length === 0) throw new BadRequestException("The file is empty")
    if (body.length > maxBytes) {
      throw new BadRequestException({
        message:
          maxBytes >= 1_048_576
            ? `Files must be ${Math.round(maxBytes / 1_048_576)} MB or smaller`
            : `Images must be ${Math.round(maxBytes / 1024)} KB or smaller`,
        code: "file_too_large",
      })
    }
    const type = sniffImage(body) ?? (opts.allowPdf ? sniffPdf(body) : null)
    if (!type) {
      throw new BadRequestException({
        message: opts.allowPdf
          ? "Upload a PNG or JPEG image, or a PDF"
          : "Upload a PNG or JPEG image",
        code: "unsupported_file_type",
      })
    }
    await this.entitlements.assertWithinLimit(
      "storageMb",
      await this.usage.storageMb(),
      body.length / 1_048_576
    )
    const workspaceId = this.ctx.workspaceId
    const key = `${workspaceId}/${purpose}/${randomUUID()}.${type.ext}`
    await this.storage.put(key, body, type.contentType)
    const [row] = await this.db
      .insert(files)
      .values({
        workspaceId,
        key,
        purpose,
        filename: filename.slice(0, 200) || `upload.${type.ext}`,
        contentType: type.contentType,
        size: body.length,
        createdBy: this.ctx.optionalUserId,
      })
      .returning()
    return row!
  }

  async find(id: string): Promise<FileRow | null> {
    const [row] = await this.db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.workspaceId, this.ctx.workspaceId)))
      .limit(1)
    return row ?? null
  }

  async read(id: string): Promise<{ file: FileRow; body: Buffer }> {
    const file = await this.find(id)
    if (!file) throw new NotFoundException("File not found")
    return { file, body: await this.storage.get(file.key) }
  }

  async url(id: string | null | undefined): Promise<string | null> {
    if (!id) return null
    const file = await this.find(id)
    return file ? this.storage.presignGet(file.key) : null
  }

  /** Delete metadata and bytes. Storage errors are logged, not thrown (orphans are harmless). */
  async remove(id: string) {
    const file = await this.find(id)
    if (!file) return
    await this.db.delete(files).where(eq(files.id, id))
    await this.storage
      .delete(file.key)
      .catch((err) => this.logger.warn(`Orphaned object ${file.key}: ${err}`))
  }
}
