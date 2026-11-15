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

describe("workspace bootstrap & RBAC", () => {
  it("gives the creator an Owner role with every permission", async () => {
    const owner = new Client(t)
    await owner.signUp("Owner")
    await owner.createWorkspace("Bootstrap")

    const roles = await owner.get("/v1/roles")
    expect(roles.status).toBe(200)
    expect(roles.body.map((r: { slug: string }) => r.slug).sort()).toEqual([
      "accountant",
      "admin",
      "member",
      "owner",
    ])

    const me = await owner.get("/v1/me")
    expect(me.status).toBe(200)
    expect(me.body.permissions).toContain("workspace.delete")
    expect(me.body.permissions).toContain("invoice.void")

    const profile = await owner.get("/v1/workspace")
    expect(profile.body).toMatchObject({
      defaultCurrency: "USD",
      paymentTermsDays: 14,
    })
  })

  it("rejects anonymous requests and validates input", async () => {
    const anon = new Client(t)
    expect((await anon.get("/v1/clients")).status).toBe(401)

    const owner = new Client(t)
    await owner.signUp("Validator")
    await owner.createWorkspace("Validation")
    const bad = await owner.post("/v1/clients", {
      name: "",
      email: "nope",
      country: "usa",
    })
    expect(bad.status).toBe(422)
    expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(
      ["country", "email", "name"]
    )
  })
})

describe("tenant isolation", () => {
  it("never exposes one workspace's data to another workspace's members", async () => {
    const alice = new Client(t)
    await alice.signUp("Alice")
    await alice.createWorkspace("Alpha")
    const created = await alice.post("/v1/clients", { name: "Alpha's client" })
    expect(created.status).toBe(201)
    const clientId = created.body.id

    const bob = new Client(t)
    await bob.signUp("Bob")
    const bobWs = await bob.createWorkspace("Beta")

    // Bob in his own workspace sees nothing, and cannot fetch Alice's client by id.
    expect((await bob.get("/v1/clients")).body.items).toEqual([])
    expect((await bob.get(`/v1/clients/${clientId}`)).status).toBe(404)
    expect(
      (await bob.patch(`/v1/clients/${clientId}`, { name: "hijack" })).status
    ).toBe(404)

    // Pointing the header at Alice's workspace is rejected: not a member.
    bob.workspaceId = alice.workspaceId
    const res = await bob.get("/v1/clients")
    expect(res.status).toBe(403)
    expect(res.body.detail).toMatch(/not a member/i)
    bob.workspaceId = bobWs.id
  })
})

describe("quotes", () => {
  it("assigns gap-free numbers under concurrent sends", async () => {
    const owner = new Client(t)
    await owner.signUp("Quoter")
    await owner.createWorkspace("Quotes")
    const client = (await owner.post("/v1/clients", { name: "Buyer" })).body
    const line = {
      description: "Work",
      quantity: 1.5,
      unitPrice: 333333,
      taxRateBps: 900,
    }

    const drafts = await Promise.all(
      [1, 2, 3].map(() =>
        owner.post("/v1/quotes", { clientId: client.id, lines: [line] })
      )
    )
    for (const d of drafts) {
      expect(d.status).toBe(201)
      expect(d.body).toMatchObject({
        subtotal: 500000,
        taxTotal: 45000,
        total: 545000,
      })
    }

    // Send the same quote 3× at once: exactly one wins.
    const sameQuote = await Promise.all(
      [1, 2, 3].map(() => owner.post(`/v1/quotes/${drafts[0]!.body.id}/send`))
    )
    expect(sameQuote.filter((r) => r.status === 200)).toHaveLength(1)
    expect(sameQuote.filter((r) => r.status === 409)).toHaveLength(2)

    // Send the other two concurrently: distinct, consecutive numbers.
    const others = await Promise.all(
      drafts.slice(1).map((d) => owner.post(`/v1/quotes/${d.body.id}/send`))
    )
    const numbers = [
      sameQuote.find((r) => r.status === 200)!.body.number,
      ...others.map((r) => r.body.number),
    ].sort()
    expect(numbers).toEqual(["QUO-0001", "QUO-0002", "QUO-0003"])

    // Sent quotes are frozen, and the client can no longer be deleted.
    expect(
      (await owner.patch(`/v1/quotes/${drafts[1]!.body.id}`, { title: "x" }))
        .status
    ).toBe(409)
    const del = await owner.del(`/v1/clients/${client.id}`)
    expect(del.status).toBe(409)
    expect(del.body.code).toBe("client_has_documents")
  })
})

describe("invitations", () => {
  it("enforces the seat limit, then grants exactly the invited role on accept", async () => {
    const owner = new Client(t)
    await owner.signUp("Inviter")
    const ws = await owner.createWorkspace("Team")
    const accountant = (await owner.get("/v1/roles")).body.find(
      (r: { slug: string }) => r.slug === "accountant"
    )

    const invitee = new Client(t)
    const { email } = await invitee.signUp("Invitee")

    // Free plan: one seat, already used by the owner.
    const blocked = await owner.post("/v1/invitations", {
      email,
      roleId: accountant.id,
    })
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe("plan_limit_reached")

    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "team" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))

    const inv = await owner.post("/v1/invitations", {
      email: email.toUpperCase(),
      roleId: accountant.id,
    })
    expect(inv.status).toBe(201)
    expect(inv.body).toMatchObject({
      email,
      status: "pending",
      role: { slug: "accountant" },
    })

    // Better Auth's own invite endpoint is disabled in favour of ours.
    expect(
      (
        await owner.post("/api/auth/organization/invite-member", {
          email,
          role: "member",
        })
      ).status
    ).toBe(404)

    const accepted = await invitee.post(
      "/api/auth/organization/accept-invitation",
      { invitationId: inv.body.id }
    )
    expect(accepted.status).toBe(200)

    invitee.workspaceId = ws.id
    const me = await invitee.get("/v1/me")
    expect(me.status).toBe(200)
    expect(me.body.permissions).toContain("invoice.send")
    expect(me.body.permissions).not.toContain("client.create")
    expect((await invitee.post("/v1/clients", { name: "nope" })).status).toBe(
      403
    )

    // Removal revokes access immediately (permission cache invalidated).
    const members = (await owner.get("/v1/members")).body
    const target = members.find((m: { email: string }) => m.email === email)
    expect((await owner.del(`/v1/members/${target.id}`)).status).toBe(204)
    expect((await invitee.get("/v1/me")).status).toBe(403)
  })
})
