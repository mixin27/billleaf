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

/**
 * A workspace URL no other test or retry has taken: a retried test runs
 * again in the same database, where its first try's workspace still holds
 * the plain slug.
 */
export const uniqueSlug = (base: string) =>
  `${base}-${Date.now().toString(36)}${n++}`

/** Create a workspace through onboarding; returns its URL slug. */
export async function createWorkspace(page: Page, name: string) {
  await page.goto("/onboarding")
  await page.getByLabel("Business name").fill(name)
  const url = page.getByLabel("URL")
  const slug = uniqueSlug(await url.inputValue())
  await url.fill(slug)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL(new RegExp(`/${slug}(/|$)`))
  return slug
}

/**
 * Sign the browser out by dropping its cookies. Leave the app first: a
 * request still in flight from the open page (a session refresh) can set
 * the session cookie again after it's cleared.
 */
export async function signOutBrowser(page: Page) {
  await page.goto("about:blank")
  await page.context().clearCookies()
}
