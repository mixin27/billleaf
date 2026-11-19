import { expect, test } from "@playwright/test"

import { createWorkspace, signUpAndSignIn } from "../support/accounts"
import { api } from "../support/api"

const HOUR_PX = 48 // calendar row height per hour

test("track time with the timer, calendar and timesheet, then invoice it", async ({
  page,
}) => {
  await signUpAndSignIn(page, "Tom Owner")
  const slug = await createWorkspace(page, "Tom Studio")
  const client = await api(page, slug, "POST", "/v1/clients", {
    name: "Acme",
  })
  const project = await api(page, slug, "POST", "/v1/projects", {
    name: "Website",
    clientId: client.id,
    currency: "USD",
    hourlyRate: 10_000,
  })
  const today = new Date().toISOString().slice(0, 10)

  // Timer: start, then stop.
  await page.goto(`/${slug}/time`)
  await page.getByLabel("What are you working on?").fill("Discovery call")
  await page.getByRole("button", { name: "Start", exact: true }).click()
  const stop = page.getByRole("button", { name: "Stop", exact: true })
  await expect(stop).toBeVisible()
  await stop.click()
  await expect(
    page.getByRole("button", { name: "Start", exact: true })
  ).toBeVisible()
  // The logged entry's description is editable in place.
  await expect(page.locator('input[value="Discovery call"]')).toBeVisible()

  // Calendar: drag 09:00–11:00 on today, then log it on the project.
  await page.goto(`/${slug}/time?tab=calendar&view=day&day=${today}`)
  const column = page.locator(`[data-day="${today}"]`)
  await expect(column).toBeVisible()
  // The calendar opens at 8 AM or today's earliest entry, so the timer
  // entry above puts 09:00 off screen when this runs just after midnight
  // UTC. Scroll to 08:30 so the drag lands on visible slots.
  await column.evaluate((el, px) => {
    let sc = el.parentElement
    while (sc && getComputedStyle(sc).overflowY !== "auto")
      sc = sc.parentElement
    if (sc) sc.scrollTop = 8.5 * px
  }, HOUR_PX)
  const box = (await column.boundingBox())!
  const x = box.x + box.width / 2
  await page.mouse.move(x, box.y + 9 * HOUR_PX + 2)
  await page.mouse.down()
  await page.mouse.move(x, box.y + 10 * HOUR_PX, { steps: 5 })
  await page.mouse.move(x, box.y + 11 * HOUR_PX, { steps: 5 })
  await page.mouse.up()
  const dialog = page.getByRole("dialog", { name: "Log time" })
  await expect(dialog.getByLabel("Start time")).toHaveValue("09:00")
  await expect(dialog.getByLabel("End time")).toHaveValue("11:00")
  await dialog.getByLabel("What did you work on?").fill("Wireframes")
  await dialog.getByRole("combobox", { name: "Project" }).click()
  await page.getByRole("option", { name: /Website/ }).click()
  await dialog.getByRole("button", { name: "Log time" }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.getByRole("button", { name: /^Wireframes, Website.*09:00 – 11:00/ })
  ).toBeVisible()

  // Timesheet: today's Website cell already holds the calendar's 2:00;
  // typing a total of 3:30 adds 1:30.
  await page.goto(`/${slug}/time?tab=timesheet`)
  const cell = page.getByLabel(`Website, ${today}`)
  await expect(cell).toHaveValue("2:00")
  await cell.fill("3:30")
  await cell.press("Enter")
  await expect(cell).toHaveValue("3:30")
  await page.reload()
  await expect(page.getByLabel(`Website, ${today}`)).toHaveValue("3:30")

  // Project: invoice the unbilled time (3.5 h × 100.00).
  await page.goto(`/${slug}/projects/${project.id}`)
  await page.getByRole("button", { name: "Invoice unbilled time" }).click()
  await page.waitForURL(new RegExp(`/${slug}/invoices/`))
  await expect(page.getByText("$350.00").first()).toBeVisible()
})
