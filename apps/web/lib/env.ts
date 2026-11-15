import { z } from "zod"

/**
 * Public env, inlined by Next at build time. Reference each variable
 * explicitly (process.env.X) so the bundler can replace it.
 */
export const env = z
  .object({
    NEXT_PUBLIC_API_URL: z.url().default("http://localhost:4000"),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  })
  .parse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  })
