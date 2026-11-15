/** Writes openapi.json for packages/api-client generation (no server started). */
import "reflect-metadata"

import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { buildOpenApi, createApp } from "./bootstrap.js"

const { app } = await createApp()
await app.init()
const out = resolve(import.meta.dirname, "../openapi.json")
writeFileSync(out, JSON.stringify(buildOpenApi(app), null, 2))
console.log(`✔ wrote ${out}`)
await app.close()
