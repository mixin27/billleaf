import helmet from "@fastify/helmet"
import multipart from "@fastify/multipart"
import { type INestApplication, VersioningType } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { Logger } from "nestjs-pino"
import { cleanupOpenApiDoc } from "nestjs-zod"

import { AppModule } from "./app.module.js"
import { ENV, type Env } from "./core/config/env.js"

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    // Better Auth needs the raw body; nestjs-better-auth re-adds parsers.
    { bodyParser: false, bufferLogs: true }
  )
  const env = app.get<Env>(ENV)

  app.useLogger(app.get(Logger))
  app.enableShutdownHooks()
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: undefined })
  app.enableCors({
    origin: [env.WEB_URL, ...env.TRUSTED_ORIGINS],
    credentials: true,
    // @fastify/cors defaults to GET,HEAD,POST only.
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "content-type",
      "x-workspace-id",
      "x-request-id",
      "authorization",
    ],
    maxAge: 600,
  })
  await app.register(helmet, { contentSecurityPolicy: false })
  // Uploads (e.g. workspace logo). Limits are enforced again per endpoint.
  await app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 },
  })

  return { app, env }
}

export function buildOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Billleaf API")
    .setVersion("1")
    .addCookieAuth("billleaf.session_token")
    .addApiKey(
      { type: "apiKey", in: "header", name: "x-workspace-id" },
      "workspace"
    )
    .build()
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config))
}
