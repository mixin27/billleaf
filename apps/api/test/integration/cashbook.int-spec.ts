import { workspaceSubscriptions } from "@workspace/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { Client, startApp, type TestApp } from "./harness.js"

let t: TestApp

beforeAll(async () => {
  t = await startApp()
})

afterAll(async () => {
  await t?.close()
})

/** Invite someone with a workspace role; returns their client and member id. */
async function join(
  owner: Client,
  wsId: string,
  roleSlug: string,
  name: string
): Promise<{ client: Client; memberId: string }> {
  const role = (await owner.get("/v1/roles")).body.find(
    (r: { slug: string }) => r.slug === roleSlug
  )
  const client = new Client(t)
  const { email } = await client.signUp(name)
  const inv = await owner.post("/v1/invitations", { email, roleId: role.id })
  expect(inv.status).toBe(201)
  await client.post("/api/auth/organization/accept-invitation", {
    invitationId: inv.body.id,
  })
  client.workspaceId = wsId
  const members = (await owner.get("/v1/members")).body
  return {
    client,
    memberId: members.find((m: { email: string }) => m.email === email).id,
  }
}

describe("cashbook", () => {
  it("keeps books private per member, gates roles, and computes balances", async () => {
    const owner = new Client(t)
    await owner.signUp("Shopkeeper")
    const ws = await owner.createWorkspace("Corner Shop")
    await owner.patch("/v1/workspace", { defaultCurrency: "MMK" })

    // Free plan: two active books.
    const shop = await owner.post("/v1/cashbooks", { name: "Shop" })
    expect(shop.status).toBe(201)
    expect(shop.body).toMatchObject({
      name: "Shop",
      currency: "MMK",
      role: "owner",
      balance: 0,
      memberCount: 1,
    })
    const home = (await owner.post("/v1/cashbooks", { name: "Home" })).body
    const third = await owner.post("/v1/cashbooks", { name: "Third" })
    expect(third.status).toBe(403)
    expect(third.body.code).toBe("plan_limit_reached")

    const book = `/v1/cashbooks/${shop.body.id}`
    const modes = (await owner.get(`${book}/modes`)).body.items
    expect(modes.map((m: { name: string }) => m.name)).toEqual([
      "Cash",
      "Online",
    ])
    const cash = modes.find((m: { name: string }) => m.name === "Cash")
    const sales = (await owner.post(`${book}/categories`, { name: "Sales" }))
      .body

    // Entries out of order: the running balance follows date and time.
    const add = (body: Record<string, unknown>) =>
      owner.post(`${book}/entries`, body)
    const opening = await add({
      type: "in",
      amount: 100_000_00,
      entryDate: "2026-11-01",
      entryTime: "08:00",
      remark: "Opening cash",
      modeId: cash.id,
    })
    expect(opening.status).toBe(201)
    await add({
      type: "in",
      amount: 40_000_00,
      entryDate: "2026-11-03",
      entryTime: "18:00",
      remark: "Daily sales",
      categoryId: sales.id,
    })
    const rice = (
      await add({
        type: "out",
        amount: 15_000_00,
        entryDate: "2026-11-02",
        entryTime: "10:30",
        remark: "Rice bags",
        contactName: "Ko Aung",
      })
    ).body
    expect(rice).toMatchObject({ balance: 85_000_00, editable: true })

    const list = (await owner.get(`${book}/entries`)).body
    expect(list.items.map((x: { remark: string }) => x.remark)).toEqual([
      "Daily sales",
      "Rice bags",
      "Opening cash",
    ])
    expect(list.items.map((x: { balance: number }) => x.balance)).toEqual([
      125_000_00, 85_000_00, 100_000_00,
    ])
    expect(list.totals).toEqual({
      totalIn: 140_000_00,
      totalOut: 15_000_00,
      net: 125_000_00,
    })

    // Filters: totals follow them; search matches remark, contact or amount.
    expect(
      (await owner.get(`${book}/entries?type=out`)).body.totals
    ).toMatchObject({ totalIn: 0, totalOut: 15_000_00 })
    expect(
      (await owner.get(`${book}/entries?q=ko%20aung`)).body.items
    ).toHaveLength(1)
    expect(
      (await owner.get(`${book}/entries?q=40,000`)).body.items[0].remark
    ).toBe("Daily sales")
    expect(
      (await owner.get(`${book}/entries?from=2026-11-02&to=2026-11-02`)).body
        .total
    ).toBe(1)

    // Editing re-balances; history records the change.
    const edited = await owner.patch(`${book}/entries/${rice.id}`, {
      amount: 20_000_00,
    })
    expect(edited.body).toMatchObject({ balance: 80_000_00, edited: true })
    const activity = (await owner.get(`${book}/entries/${rice.id}/activity`))
      .body.items
    expect(activity.map((a: { action: string }) => a.action)).toEqual([
      "updated",
      "created",
    ])
    expect(activity[0].changes.amount).toEqual([15_000_00, 20_000_00])

    // Report and exports.
    const report = (
      await owner.get(`${book}/report?from=2026-11-02&to=2026-11-30`)
    ).body
    expect(report).toMatchObject({
      openingBalance: 100_000_00,
      totalIn: 40_000_00,
      totalOut: 20_000_00,
      closingBalance: 120_000_00,
    })
    expect(report.byCategory[0]).toMatchObject({ name: "Sales" })
    const csv = await t.app.inject({
      method: "GET",
      url: `${book}/export.csv`,
      headers: owner.headers(),
    })
    expect(csv.statusCode).toBe(200)
    expect(csv.body).toContain("Rice bags")
    expect(csv.body).toContain("120000") // closing balance, whole kyat
    const pdf = await t.app.inject({
      method: "GET",
      url: `${book}/statement.pdf`,
      headers: owner.headers(),
    })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF")

    // ── Members ────────────────────────────────────────────────────────
    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "team" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))
    const staff = await join(owner, ws.id, "member", "Staff")
    const auditor = await join(owner, ws.id, "accountant", "Auditor")
    const manager = await join(owner, ws.id, "admin", "Manager")

    // Not a member of any book yet: sees none, and the book is a 404.
    expect((await staff.client.get("/v1/cashbooks")).body.items).toEqual([])
    expect((await staff.client.get(book)).status).toBe(404)

    await owner.post(`${book}/members`, {
      memberId: staff.memberId,
      role: "operator",
    })
    await owner.post(`${book}/members`, {
      memberId: auditor.memberId,
      role: "viewer",
    })
    const staffBooks = (await staff.client.get("/v1/cashbooks")).body.items
    expect(staffBooks.map((b: { name: string }) => b.name)).toEqual(["Shop"])
    expect(staffBooks[0]).toMatchObject({
      role: "operator",
      balance: 120_000_00,
    })

    // Operator: adds and edits their own entry, not others'.
    const tea = await staff.client.post(`${book}/entries`, {
      type: "out",
      amount: 2_000_00,
      remark: "Tea",
    })
    expect(tea.status).toBe(201)
    expect(tea.body.createdBy.memberId).toBe(staff.memberId)
    expect(
      (
        await staff.client.patch(`${book}/entries/${tea.body.id}`, {
          remark: "Tea and snacks",
        })
      ).status
    ).toBe(200)
    expect(
      (
        await staff.client.patch(`${book}/entries/${rice.id}`, {
          amount: 1,
        })
      ).status
    ).toBe(403)
    expect(
      (await staff.client.post(`${book}/categories`, { name: "Snacks" })).status
    ).toBe(403)

    // Viewer: reads and exports, can't write.
    expect((await auditor.client.get(`${book}/entries`)).status).toBe(200)
    expect(
      (
        await auditor.client.post(`${book}/entries`, {
          type: "in",
          amount: 1,
        })
      ).status
    ).toBe(403)

    // Workspace admins (cashbook.manage) see every book, including Home.
    const managed = (await manager.client.get("/v1/cashbooks")).body.items
    expect(managed.map((b: { name: string }) => b.name).sort()).toEqual([
      "Home",
      "Shop",
    ])

    // The last owner can't step down; moving entries needs the same currency.
    expect(
      (
        await owner.patch(`${book}/members/${staff.memberId}`, {
          role: "admin",
        })
      ).status
    ).toBe(200)
    const ownerId = (await owner.get(`${book}/members`)).body.items.find(
      (m: { role: string }) => m.role === "owner"
    ).memberId
    expect((await owner.del(`${book}/members/${ownerId}`)).body.code).toBe(
      "cashbook_last_owner"
    )

    const moved = await owner.post(`${book}/entries/transfer`, {
      entryIds: [tea.body.id],
      toBookId: home.id,
      mode: "move",
    })
    expect(moved.body).toEqual({ count: 1 })
    expect((await owner.get(`/v1/cashbooks/${home.id}`)).body.balance).toBe(
      -2_000_00
    )

    // Currency can't change once there are entries; delete leaves the balance.
    expect((await owner.patch(book, { currency: "USD" })).body.code).toBe(
      "cashbook_has_entries"
    )
    expect((await owner.del(`${book}/entries/${rice.id}`)).status).toBe(204)
    expect((await owner.get(book)).body.balance).toBe(140_000_00)
  })

  it("imports a CashBook export once, with modes and the right balance", async () => {
    const owner = new Client(t)
    await owner.signUp("Ma Thida")
    await owner.createWorkspace("Thida Home")
    await owner.patch("/v1/workspace", { defaultCurrency: "MMK" })
    const book = (await owner.post("/v1/cashbooks", { name: "Home" })).body
    const url = `/v1/cashbooks/${book.id}/import`

    const file = [
      `"Date","Time","Remark","Entry by","Contact","Mode","Cash In","Cash Out","Balance"`,
      `"04 May 2026","12:47 pm","","Ma Thida","Ko Ko","Online",5000000,,5000000`,
      `"04 May 2026","7:19 pm","","Ma Thida","Mom","Cash",,2000000,3000000`,
      `"10 May 2026","10:08 pm","Repair","Someone Else","","KBZPay",,500000,2500000`,
      `"31 Feb 2026","1:00 pm","bad","","","",1,,1`,
    ].join("\n")
    const send = async (query: string, body = file) => {
      const boundary = "----billleaf-test"
      const payload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="Home@CashBook.csv"\r\nContent-Type: text/csv\r\n\r\n`
        ),
        Buffer.from(body),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ])
      const res = await t.app.inject({
        method: "POST",
        url: `${url}${query}`,
        headers: {
          ...owner.headers(),
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })
      return { status: res.statusCode, body: JSON.parse(res.body) }
    }

    // Dry run: nothing written, a full preview.
    const preview = await send("?dryRun=true")
    expect(preview.status).toBe(200)
    expect(preview.body).toMatchObject({
      dryRun: true,
      rows: 3,
      added: 3,
      duplicates: 0,
      invalid: [{ line: 5, message: `Unreadable date "31 Feb 2026"` }],
      from: "2026-05-04",
      to: "2026-05-10",
      totalIn: 5_000_000_00,
      totalOut: 2_500_000_00,
      balanceBefore: 0,
      balanceAfter: 2_500_000_00,
      fileOpeningBalance: 0,
      fileClosingBalance: 2_500_000_00,
      newModes: ["KBZPay"],
      newCategories: [],
      unmatchedPeople: ["Someone Else"],
    })
    expect((await owner.get(`/v1/cashbooks/${book.id}`)).body.entryCount).toBe(
      0
    )

    // Import: the book matches the file's last balance.
    const done = await send("")
    expect(done.body).toMatchObject({ dryRun: false, added: 3 })
    const after = (await owner.get(`/v1/cashbooks/${book.id}`)).body
    expect(after).toMatchObject({ balance: 2_500_000_00, entryCount: 3 })
    const entries = (await owner.get(`/v1/cashbooks/${book.id}/entries`)).body
      .items
    expect(entries[0]).toMatchObject({
      entryDate: "2026-05-10",
      entryTime: "22:08",
      remark: "Repair",
      modeName: "KBZPay",
      balance: 2_500_000_00,
      createdBy: { you: true },
    })
    expect(entries[2]).toMatchObject({
      contactName: "Ko Ko",
      modeName: "Online",
      createdBy: { name: "Ma Thida" },
    })

    // The same file again adds nothing; a longer export adds only the new row.
    const again = await send("")
    expect(again.body).toMatchObject({ added: 0, duplicates: 3 })
    const longer = await send(
      "",
      `${file}\n"21 May 2026","1:59 pm","Tea","Ma Thida","","Cash",,1000,2499000`
    )
    expect(longer.body).toMatchObject({ added: 1, duplicates: 3 })
    expect((await owner.get(`/v1/cashbooks/${book.id}`)).body.balance).toBe(
      2_499_000_00
    )

    // Not a CashBook file.
    const wrong = await send("", "Name,Email\nA,b@c.d")
    expect(wrong.status).toBe(400)
    expect(wrong.body.code).toBe("cashbook_import_format")
  })
})
