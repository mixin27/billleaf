import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common"

import { ENV, type Env } from "../config/env.js"

/**
 * S3-compatible object storage. Objects are private; browsers get short-lived
 * presigned GET URLs. Keys are always prefixed with the workspace id.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name)
  private readonly client: S3Client
  private readonly bucket: string

  constructor(@Inject(ENV) private readonly env: Env) {
    this.bucket = env.S3_BUCKET
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    })
  }

  /** Dev/test convenience: create the bucket if missing. Production buckets are provisioned. */
  async onModuleInit() {
    if (this.env.NODE_ENV === "production") return
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
        this.logger.log(`Created bucket ${this.bucket}`)
      } catch (err) {
        this.logger.warn(
          `Object storage unavailable (${(err as Error).message}); uploads will fail`
        )
      }
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    )
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    )
    return Buffer.from(await res.Body!.transformToByteArray())
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    )
  }

  /** Delete every object under `prefix` (in pages of 1,000). Returns the count. */
  async deletePrefix(prefix: string): Promise<number> {
    if (!prefix.endsWith("/")) throw new Error("Prefix must end with /")
    let deleted = 0
    let token: string | undefined
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        })
      )
      const keys = (page.Contents ?? []).flatMap((o) =>
        o.Key ? [{ Key: o.Key }] : []
      )
      if (keys.length) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys, Quiet: true },
          })
        )
        deleted += keys.length
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return deleted
  }

  presignGet(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      {
        expiresIn: expiresInSeconds,
      }
    )
  }
}
