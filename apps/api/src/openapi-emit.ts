/**
 * Writes openapi.json (for packages/api-client) and openapi.public.json (the
 * Developer API subset, for apps/docs) without starting a server.
 */
import "reflect-metadata"

import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { buildOpenApi, createApp } from "./bootstrap.js"
import { publicOpenApi } from "./public-openapi.js"

const { app } = await createApp()
await app.init()
const out = resolve(import.meta.dirname, "../openapi.json")
const doc = buildOpenApi(app)
writeFileSync(out, JSON.stringify(doc, null, 2))
console.log(`✔ wrote ${out}`)
// The Developer API subset, for the docs site's API reference.
const publicOut = resolve(import.meta.dirname, "../openapi.public.json")
writeFileSync(
  publicOut,
  JSON.stringify(publicOpenApi(doc, "https://your-billleaf-api"), null, 2)
)
console.log(`✔ wrote ${publicOut}`)
await app.close()
