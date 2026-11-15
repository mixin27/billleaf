import { BadRequestException } from "@nestjs/common"
import type { FastifyRequest } from "fastify"

/**
 * Read a multipart form with at most one file plus text fields (any order).
 * The file is buffered in memory, so keep `maxBytes` small (images).
 */
export async function readMultipart(
  req: FastifyRequest,
  opts: { maxBytes: number; requireFile?: boolean }
): Promise<{
  file: { filename: string; body: Buffer } | null
  fields: Record<string, string>
}> {
  if (!req.isMultipart())
    throw new BadRequestException("Send the form as multipart/form-data")
  const fields: Record<string, string> = {}
  let file: { filename: string; body: Buffer } | null = null
  const tooLarge = () =>
    new BadRequestException({
      message: `Files must be ${Math.round(opts.maxBytes / 1024)} KB or smaller`,
      code: "file_too_large",
    })
  try {
    for await (const part of req.parts({
      limits: { fileSize: opts.maxBytes, files: 1, fields: 20 },
    })) {
      if (part.type === "file") {
        const body = await part.toBuffer()
        if (part.file.truncated) throw tooLarge()
        file = { filename: part.filename, body }
      } else if (typeof part.value === "string") {
        fields[part.fieldname] = part.value
      }
    }
  } catch (e) {
    if (e instanceof BadRequestException) throw e
    const code = (e as { code?: string }).code
    if (code === "FST_REQ_FILE_TOO_LARGE") throw tooLarge()
    throw new BadRequestException("Couldn't read the upload")
  }
  if (opts.requireFile && !file)
    throw new BadRequestException({
      message: "Attach a screenshot or photo of the payment",
      code: "file_required",
    })
  return { file, fields }
}
