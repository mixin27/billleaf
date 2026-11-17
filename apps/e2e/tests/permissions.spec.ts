import { expect, test } from "@playwright/test"

import {
  createWorkspace,
  PASSWORD,
  signUpAndSignIn,
  uniqueEmail,
} from "../support/accounts"
import { markEmailVerified, setPlan } from "../support/db"
import { API_URL, WEB_URL } from "../support/env"
import { linkIn, waitForEmail } from "../support/mailpit"

test("invite a member by email; they only see and do what their role allows", async ({
  page,
  browser,
}) => {
  await signUpAndSignIn(page, "Pam Owner")
  const slug = await createWorkspace(page, "Pam Agency")
  await setPlan(slug, "team") // more than one member

  // Owner sees owner-only settings.
  await page.goto(`/${slug}/settings/general`)
  for (const item of ["Billing", "Audit log", "Rates", "Members"])
    await expect(
      page.getByRole("link", { name: item, exact: true })
    ).toBeVisible()

  // Invite by email with the Member role.
  const memberEmail = uniqueEmail("member")
  await page.goto(`/${slug}/settings/members`)
  await page.getByLabel("Invite by email").fill(memberEmail)
  const send = page.getByRole("button", { name: "Send invite" })
  if (await send.isDisabled()) {
    await page.locator("#invite-role").click()
    await page.getByRole("option", { name: /^Member/ }).click()
  }
  await send.click()
  await expect(page.getByText(memberEmail).first()).toBeVisible()

  // The invitee follows the email link, creates an account and joins.
  const invite = await waitForEmail(memberEmail, /invit/i)
  const ctx = await browser.newContext()
  const member = await ctx.newPage()
  await member.goto(linkIn(invite, /accept-invitation/))
  await member.getByText("Create an account", { exact: true }).click()
  await member.getByLabel("Name").fill("Max Member")
  await member.getByLabel("Email").fill(memberEmail)
  await member.getByLabel("Password").fill(PASSWORD)
  await member.getByRole("button", { name: "Create account" }).click()
  await expect(member).toHaveURL(/\/verify-email/)
  // (Email verification itself is covered in auth.spec.ts.)
  await markEmailVerified(memberEmail)
  await member.goto(linkIn(invite, /accept-invitation/))
  await member.getByText("Sign in to continue", { exact: true }).click()
  await member.getByLabel("Email").fill(memberEmail)
  await member.getByLabel("Password").fill(PASSWORD)
  await member.getByRole("button", { name: /sign in/i }).click()
  await member.getByRole("button", { name: "Accept invitation" }).click()
  await expect(member).toHaveURL(new RegExp(`/${slug}(/|$)`))

  // Member: day-to-day work yes, owner settings no.
  await expect(
    member.getByRole("link", { name: "Clients", exact: true })
  ).toBeVisible()
  await member.goto(`/${slug}/settings/general`)
  await expect(
    member.getByRole("link", { name: "General", exact: true })
  ).toBeVisible()
  for (const item of ["Billing", "Audit log", "Rates"])
    await expect(
      member.getByRole("link", { name: item, exact: true })
    ).toHaveCount(0)

  // The API enforces it, whatever the UI shows.
  const org = await member.request.get(
    `${API_URL}/api/auth/organization/get-full-organization?organizationSlug=${slug}`,
    { headers: { origin: WEB_URL } }
  )
  const { id } = (await org.json()) as { id: string }
  const headers = { origin: WEB_URL, "x-workspace-id": id }
  expect(
    (await member.request.get(`${API_URL}/v1/rates`, { headers })).status()
  ).toBe(403)
  expect(
    (await member.request.get(`${API_URL}/v1/clients`, { headers })).status()
  ).toBe(200)
  await ctx.close()
})
