import { expect, test } from "@playwright/test"

import { PASSWORD, uniqueEmail } from "../support/accounts"
import { linkIn, waitForEmail } from "../support/mailpit"

test("sign up, verify the email from the inbox, and create a workspace", async ({
  page,
}) => {
  const email = uniqueEmail("signup")
  await page.goto("/sign-up")
  await page.getByLabel("Name").fill("Eve Owner")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).toHaveURL(/\/verify-email/)

  // The verification email (sent by the worker) signs you in.
  const mail = await waitForEmail(email, /verify|confirm/i)
  await page.goto(linkIn(mail, /verify-email/))
  await expect(page).toHaveURL(/\/onboarding/)

  await page.getByLabel("Business name").fill("Eve Studio")
  await page.getByRole("button", { name: "Create workspace" }).click()
  await expect(page).toHaveURL(/\/eve-studio/)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

  // Signing out and back in lands in the workspace.
  await page.context().clearCookies()
  await page.goto("/sign-in")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: /sign in/i }).click()
  await expect(page).toHaveURL(/\/eve-studio/)
})
