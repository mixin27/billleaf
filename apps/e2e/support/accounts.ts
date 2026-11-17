import { type APIRequestContext, expect, type Page } from "@playwright/test"

import { markEmailVerified } from "./db"
import { API_URL, WEB_URL } from "./env"

let n = 0
/** A unique email for this run (the e2e database is fresh each run). */
export const uniqueEmail = (label: string) =>
  `${label}.${Date.now().toString(36)}${n++}@e2e.test`

export const PASSWORD = "e2e-Password-123!"

/**
 * Sign up through the API, mark the email verified (the UI journey in
 * auth.spec.ts covers the real inbox), and sign `page` in. Cookies land in
 * the page's browser context, so the web app is signed in too.
 */
export async function signUpAndSignIn(
  page: Page,
  name: string,
  email?: string
) {
  const address = email ?? uniqueEmail(name.toLowerCase().replace(/\W+/g, "."))
  const req: APIRequestContext = page.request
  const headers = { origin: WEB_URL }
  const up = await req.post(`${API_URL}/api/auth/sign-up/email`, {
    headers,
    data: { name, email: address, password: PASSWORD },
  })
  expect(up.ok(), await up.text()).toBe(true)
  await markEmailVerified(address)
  const inRes = await req.post(`${API_URL}/api/auth/sign-in/email`, {
    headers,
    data: { email: address, password: PASSWORD },
  })
  expect(inRes.ok(), await inRes.text()).toBe(true)
  return address
}

/** Create a workspace through onboarding; returns its URL slug. */
export async function createWorkspace(page: Page, name: string) {
  await page.goto("/onboarding")
  await page.getByLabel("Business name").fill(name)
  const slug = await page.getByLabel("URL").inputValue()
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL(new RegExp(`/${slug}(/|$)`))
  return slug
}
