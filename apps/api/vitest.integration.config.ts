import swc from "unplugin-swc"
import { defineConfig } from "vitest/config"

/**
 * Integration tests: real Postgres + Redis, full Nest app via Fastify inject.
 *   pnpm infra:up && pnpm --filter api test:integration
 * Uses TEST_DATABASE_URL (default: <DATABASE_URL host>/billleaf_test), which is
 * dropped and re-migrated on every run.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ["test/integration/**/*.int-spec.ts"],
    globalSetup: ["test/integration/global-setup.ts"],
    setupFiles: ["test/integration/env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
})
