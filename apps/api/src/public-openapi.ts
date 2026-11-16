import type { OpenAPIObject } from "@nestjs/swagger"

/** Tags whose operations an API key can use, published at /docs/api. */
export const PUBLIC_API_TAGS = [
  "clients",
  "quotes",
  "contracts",
  "projects",
  "time",
  "invoices",
  "recurring-invoices",
  "payments",
  "expenses",
]

const METHODS = ["get", "put", "post", "patch", "delete"] as const

/**
 * The Developer API reference: only key-usable operations, bearer auth
 * only, and only the schemas they reference.
 */
export function publicOpenApi(
  full: OpenAPIObject,
  apiUrl: string
): OpenAPIObject {
  const paths: OpenAPIObject["paths"] = {}
  for (const [path, item] of Object.entries(full.paths)) {
    const kept: Record<string, unknown> = {}
    for (const m of METHODS) {
      const op = item[m]
      if (!op?.tags?.some((t) => PUBLIC_API_TAGS.includes(t))) continue
      kept[m] = { ...op, security: [{ apiKey: [] }] }
    }
    if (Object.keys(kept).length) paths[path] = kept as never
  }

  // Keep only schemas reachable from the kept operations.
  const schemas = full.components?.schemas ?? {}
  const used = new Set<string>()
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== "object") return
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") {
        const name = v.replace("#/components/schemas/", "")
        if (!used.has(name)) {
          used.add(name)
          visit(schemas[name])
        }
      } else visit(v)
    }
  }
  visit(paths)

  return {
    openapi: full.openapi,
    info: {
      title: "Billleaf Developer API",
      version: "1",
      description:
        "Send `Authorization: Bearer blk_…` with a key from Settings → API keys. The key acts as the member who created it, limited to its permissions, in its own workspace. Amounts are integers in minor units.",
    },
    servers: [{ url: apiUrl }],
    tags: (full.tags ?? []).filter((t) => PUBLIC_API_TAGS.includes(t.name)),
    paths,
    components: {
      schemas: Object.fromEntries(
        Object.entries(schemas).filter(([k]) => used.has(k))
      ),
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description: "An API key (`blk_…`) from Settings → API keys.",
        },
      },
    },
  }
}
