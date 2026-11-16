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

const words = (camel: string) =>
  camel
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(" ")

const VERBS = new Set([
  "list",
  "get",
  "create",
  "update",
  "remove",
  "delete",
  "archive",
  "restore",
  "issue",
  "send",
  "void",
  "duplicate",
  "pause",
  "resume",
  "accept",
  "decline",
  "sign",
  "confirm",
  "reject",
  "record",
  "refund",
  "email",
])

/** Controller names that read better as a different noun. */
const NOUNS: Record<string, string> = { recurring: "recurring invoices" }

const cap = (w: string) => (w === "PDF" ? w : w[0]!.toUpperCase() + w.slice(1))

/**
 * Readable, unique names for the reference. Nest's operation ids look like
 * `ContractTemplatesController_get_v1`: the id becomes
 * `contract-templates-get` (controller + method is unique), the summary
 * "Get contract template" / "List contract templates" / "Add contact".
 */
export function operationNames(operationId: string) {
  const m = /^(\w+?)Controller_([A-Za-z0-9]+)_v\d+$/.exec(operationId)
  if (!m) return { id: operationId, summary: operationId }
  const base = words(m[1]!).join(" ")
  const noun = NOUNS[base] ?? base
  const method = words(m[2]!).map((w) => (w === "pdf" ? "PDF" : w))
  const singular = noun.replace(/ies$/, "y").replace(/s$/, "")
  const plural = noun.endsWith("s") ? noun : `${noun}s`
  const verb = method[0]!
  const summary =
    method.length > 1
      ? [cap(verb), ...method.slice(1)].join(" ")
      : verb === "list"
        ? `List ${plural}`
        : VERBS.has(verb)
          ? `${cap(verb)} ${singular}`
          : `${cap(verb)} (${noun})`
  return {
    id: [...words(m[1]!), ...words(m[2]!)].join("-"),
    summary: summary.replace(/^Pdf\b/, "PDF"),
  }
}

/**
 * The Developer API reference: only key-usable operations, bearer auth
 * only, and only the schemas they reference.
 */
export function publicOpenApi(
  full: OpenAPIObject,
  apiUrl: string
): OpenAPIObject {
  const paths: OpenAPIObject["paths"] = {}
  const ids = new Set<string>()
  for (const [path, item] of Object.entries(full.paths)) {
    const kept: Record<string, unknown> = {}
    for (const m of METHODS) {
      const op = item[m]
      const tag = op?.tags?.find((t) => PUBLIC_API_TAGS.includes(t))
      if (!op || !tag) continue
      const names = operationNames(op.operationId ?? `${m}_${path}`)
      // Docs pages are named after ids: a clash would overwrite a page.
      if (ids.has(names.id))
        throw new Error(`Duplicate public operation id: ${names.id}`)
      ids.add(names.id)
      kept[m] = {
        ...op,
        operationId: names.id,
        summary: op.summary ?? names.summary,
        security: [{ apiKey: [] }],
      }
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
