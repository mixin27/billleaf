import { expect, test } from "@playwright/test"

import { createWorkspace, signUpAndSignIn } from "../support/accounts"

// Runs in the "mobile" project (Pixel 7, 412 px wide).
test("main screens fit a phone and the menu works", async ({ page }) => {
  await signUpAndSignIn(page, "Mia Owner")
  const slug = await createWorkspace(page, "Mia Studio")

  const noSideScroll = async () => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(
      overflow,
      `page scrolls sideways on ${page.url()}`
    ).toBeLessThanOrEqual(1)
  }

  for (const path of [
    "",
    "/clients",
    "/quotes",
    "/invoices",
    "/time",
    "/expenses",
  ]) {
    await page.goto(`/${slug}${path}`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await noSideScroll()
  }

  // The sidebar is a drawer on phones.
  await page.goto(`/${slug}`)
  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await page.getByRole("link", { name: "Invoices", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/${slug}/invoices`))

  // The time calendar starts in day view on a phone.
  await page.goto(`/${slug}/time?tab=calendar`)
  await expect(page.locator("[data-day]")).toHaveCount(1)
  await noSideScroll()
})
