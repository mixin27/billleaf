/**
 * Regenerates the API reference pages from the API's public OpenAPI spec.
 *
 *   pnpm gen:api-client          # also writes apps/api/openapi.public.json
 *   pnpm --filter docs gen:api   # copies it here and writes the MDX pages
 *
 * Outputs (openapi/public.json and content/docs/developers/api-reference)
 * are committed, so building the docs never needs the API.
 */
import { copyFileSync, existsSync, rmSync } from "node:fs"
import path from "node:path"

import { generateFiles } from "fumadocs-openapi"

import { openapi } from "../lib/openapi"

const source = path.resolve("../api/openapi.public.json")
if (existsSync(source))
  copyFileSync(source, path.resolve("openapi/public.json"))
else
  console.warn(
    "apps/api/openapi.public.json not found; using the committed copy"
  )

const output = path.resolve("content/docs/developers/api-reference")
rmSync(output, { recursive: true, force: true })

await generateFiles({
  input: openapi,
  output,
  per: "operation",
  groupBy: "tag",
  includeDescription: true,
  meta: true,
  index: {
    url: { baseUrl: "/docs", contentDir: path.resolve("content/docs") },
    items: [
      {
        path: "index.mdx",
        title: "API reference",
        description:
          "Every endpoint an API key can use. Send `Authorization: Bearer blk_…`; amounts are integers in minor units.",
      },
    ],
  },
})
console.log(`✔ API reference written to ${output}`)
