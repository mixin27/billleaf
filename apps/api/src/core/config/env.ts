import { createEnv, nodeEnvSchema, z } from "@workspace/env"

const csv = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  )

export const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),

  BETTER_AUTH_SECRET: z.string().min(32),
  API_URL: z.url(),
  WEB_URL: z.url(),
  TRUSTED_ORIGINS: csv,
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((v) => v || undefined),

  GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .optional()
    .transform((v) => v || undefined),

  // Optional observability (read directly by src/instrument.ts; listed for docs/validation)
  SENTRY_DSN: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),

  SMTP_URL: z.string().default("smtp://localhost:1025"),
  EMAIL_FROM: z.string().default("Billleaf <no-reply@billleaf.local>"),
})

export type Env = z.infer<typeof envSchema>

export const ENV = Symbol("ENV")

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return createEnv(envSchema, source)
}
