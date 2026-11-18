import { defineConfig } from "vitest/config"

/** Unit tests for pure modules only (no React Native runtime). */
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
})
