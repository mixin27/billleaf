import { expect, test } from "@playwright/test"

import {
  createWorkspace,
  signUpAndSignIn,
  uniqueEmail,
} from "../support/accounts"
import { linkIn, waitForEmail } from "../support/mailpit"

test("client → quote → accepted in the portal → invoice → payment → receipt", async ({
  page,
  browser,
}) => {
  await signUpAndSignIn(page, "Ivy Owner")
  const slug = await createWorkspace(page, "Ivy Studio")
  const clientEmail = uniqueEmail("client")

  // Client
  await page.goto(`/${slug}/clients`)
  await page.getByRole("button", { name: "New client" }).first().click()
  const clientDialog = page.getByRole("dialog")
  await clientDialog.getByLabel("Name").fill("Northwind Traders")
  await clientDialog.getByLabel("Email").fill(clientEmail)
  await clientDialog.getByRole("button", { name: "Create client" }).click()
  await expect(clientDialog).toBeHidden()

  // Quote: draft → mark as sent → email it
  await page.goto(`/${slug}/quotes/new`)
  await page.getByRole("combobox", { name: "Client" }).click()
  await page.getByRole("option", { name: /Northwind Traders/ }).click()
  await page.getByLabel("Title").fill("Website redesign")
  await page.getByLabel("Description").first().fill("Design and build")
  await page.getByLabel("Quantity").first().fill("1")
  await page.getByLabel("Unit price").first().fill("1200")
  await page.getByRole("button", { name: "Create draft" }).click()
  await expect(page.getByRole("button", { name: "Mark as sent" })).toBeVisible()
  const quoteUrl = page.url().replace(/\/edit$/, "")
  if (page.url().endsWith("/edit")) await page.goto(quoteUrl)

  await page.getByRole("button", { name: "Mark as sent" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Mark as sent" })
    .click()
  await page.getByRole("button", { name: "Email" }).click()
  await page.getByRole("button", { name: "Send email" }).click()
  await expect(page.getByText("Quote emailed")).toBeVisible()

  // The client opens the emailed link and accepts in the portal.
  const quoteMail = await waitForEmail(clientEmail, /quote/i)
  const clientContext = await browser.newContext()
  const portal = await clientContext.newPage()
  await portal.goto(linkIn(quoteMail, /\/portal\//))
  // The link signs the client in and opens this quote.
  await expect(portal.getByText("Accept this quote?")).toBeVisible()
  await portal.getByLabel("Your full name").fill("Nora Client")
  await portal.getByRole("button", { name: "Accept quote" }).click()
  await expect(portal.getByText(/accepted/i).first()).toBeVisible()
  await clientContext.close()

  // Owner: accepted → invoice → issue → record payment → receipt
  await page.goto(quoteUrl)
  await page.getByRole("button", { name: "Create invoice" }).click()
  await page.waitForURL(new RegExp(`/${slug}/invoices/`))
  await page.getByRole("button", { name: "Issue invoice" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Issue" })
    .click()
  await expect(page.getByText("INV-0001").first()).toBeVisible()
  // Issuing offers to email it straight away; the client gets the PDF.
  const send = page.getByRole("dialog", { name: /Email INV-0001/ })
  await send.getByRole("button", { name: "Send email" }).click()
  await expect(send).toBeHidden()
  const invoiceMail = await waitForEmail(clientEmail, /INV-0001/)
  expect(invoiceMail.text).toContain("1,200.00")

  await page.getByRole("button", { name: "Record payment" }).click()
  const pay = page.getByRole("dialog")
  await expect(pay.getByLabel(/Amount/)).toHaveValue(/1,?200(\.00)?/)
  await pay.getByRole("button", { name: "Record payment" }).click()
  await expect(pay).toBeHidden()
  await expect(page.getByText("RCT-0001").first()).toBeVisible()
  await expect(page.getByText(/^Paid$/).first()).toBeVisible()
})
