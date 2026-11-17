import { defineConfig, devices } from "@playwright/test"

import { API_URL, WEB_PORT, WEB_URL, webEnv } from "./support/env"

const CI = Boolean(process.env.CI)

/**
 * End-to-end: the web app (production build on :3100) against the API and
 * worker (:4100, their own database), with Postgres, Valkey, S3 and Mailpit
 * from `pnpm infra:up`. Build the API first (`pnpm --filter api build`).
 */
export default defineConfig({
  testDir: "./tests",
  // Journeys share one database; each test makes its own users/workspaces.
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-US",
    timezoneId: "UTC",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: [
    {
      command: "node support/stack.ts",
      url: `${API_URL}/health/live`,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: process.env.E2E_DEBUG ? "pipe" : "ignore",
      stderr: "pipe",
    },
    {
      // Its own build folder (.next-e2e) so it never clashes with `next dev`.
      command: `pnpm exec next build && pnpm exec next start -p ${WEB_PORT}`,
      cwd: "../web",
      env: webEnv,
      url: `${WEB_URL}/sign-in`,
      timeout: 300_000,
      reuseExistingServer: !CI,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
})
