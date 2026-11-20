import { expect, test } from "@playwright/test"

import {
  createWorkspace,
  signOutBrowser,
  signUpAndSignIn,
} from "../support/accounts"
import { linkIn, waitForEmail } from "../support/mailpit"

test("forgot password: email link → new password → sign in with it", async ({
  page,
}) => {
  const email = await signUpAndSignIn(page, "Rita Owner")
  const slug = await createWorkspace(page, "Rita Studio")
  await signOutBrowser(page)

  await page.goto("/sign-in")
  await page.getByLabel("Email").fill(email)
  await page.getByRole("link", { name: "Forgot password?" }).click()
  await expect(page).toHaveURL(/\/forgot-password/)
  await expect(page.getByLabel("Email")).toHaveValue(email)
  await page.getByRole("button", { name: "Send reset link" }).click()
  await expect(page.getByText("Check your email")).toBeVisible()

  const mail = await waitForEmail(email, /reset/i)
  await page.goto(linkIn(mail, /reset-password/))
  await expect(page).toHaveURL(/\/reset-password\?token=/)
  const newPassword = "e2e-New-Password-456!"
  await page.getByLabel("New password", { exact: true }).fill(newPassword)
  await page.getByLabel("Confirm new password").fill(newPassword)
  await page.getByRole("button", { name: "Save new password" }).click()
  await expect(page).toHaveURL(/\/sign-in/)

  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(newPassword)
  await page.getByRole("button", { name: /sign in/i }).click()
  await expect(page).toHaveURL(new RegExp(`/${slug}`))

  // The link works once.
  await signOutBrowser(page)
  await page.goto(linkIn(mail, /reset-password/))
  await expect(page.getByText("This link has expired")).toBeVisible()
})

test("an unknown email still gets the same answer", async ({ page }) => {
  await page.goto("/forgot-password")
  await page.getByLabel("Email").fill("nobody.here@e2e.test")
  await page.getByRole("button", { name: "Send reset link" }).click()
  await expect(page.getByText("Check your email")).toBeVisible()
})
