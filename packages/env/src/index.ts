import { z } from "zod"

/**
 * Validate `source` (defaults to `process.env`) against a Zod object schema.
 * Fails fast with a readable list of problems — apps call this once at boot.
 */
export function createEnv<T extends z.ZodObject>(
  schema: T,
  source: Record<string, string | undefined> = process.env
): z.infer<T> {
  const result = schema.safeParse(source)
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`
    )
    throw new Error(`Invalid environment variables:\n${lines.join("\n")}`)
  }
  return result.data
}

/** Common building blocks. */
export const nodeEnvSchema = z
  .enum(["development", "test", "production"])
  .default("development")

export const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1")

export { z }
