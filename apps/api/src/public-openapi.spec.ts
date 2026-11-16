import type { OpenAPIObject } from "@nestjs/swagger"
import { describe, expect, it } from "vitest"

import { operationNames, publicOpenApi } from "./public-openapi.js"

const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` })

describe("publicOpenApi", () => {
  it("keeps key-usable operations and the schemas they use", () => {
    const full = {
      openapi: "3.0.0",
      info: { title: "x", version: "1" },
      tags: [{ name: "clients" }, { name: "admin" }],
      paths: {
        "/v1/clients": {
          get: {
            tags: ["clients"],
            responses: {
              200: {
                content: { "application/json": { schema: ref("ClientList") } },
              },
            },
          },
        },
        "/v1/admin/users": {
          get: {
            tags: ["admin"],
            responses: {
              200: {
                content: { "application/json": { schema: ref("AdminUsers") } },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          ClientList: {
            type: "object",
            properties: { items: { type: "array", items: ref("Client") } },
          },
          Client: { type: "object" },
          AdminUsers: { type: "object" },
        },
      },
    } as unknown as OpenAPIObject
    const doc = publicOpenApi(full, "https://api.example.com")
    expect(Object.keys(doc.paths)).toEqual(["/v1/clients"])
    expect(Object.keys(doc.components!.schemas!).sort()).toEqual([
      "Client",
      "ClientList",
    ])
    expect(doc.tags).toEqual([{ name: "clients" }])
    expect(doc.paths["/v1/clients"]!.get!.security).toEqual([{ apiKey: [] }])
    expect(doc.servers).toEqual([{ url: "https://api.example.com" }])
  })

  it("names operations readably", () => {
    expect(operationNames("ClientsController_addContact_v1")).toEqual({
      id: "clients-add-contact",
      summary: "Add contact",
    })
    expect(operationNames("ClientsController_list_v1").summary).toBe(
      "List clients"
    )
    expect(operationNames("ContractTemplatesController_get_v1")).toEqual({
      id: "contract-templates-get",
      summary: "Get contract template",
    })
    expect(operationNames("TimeReportsController_summary_v1").summary).toBe(
      "Summary (time reports)"
    )
  })
})
