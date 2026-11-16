import "./instrument.js"
import "reflect-metadata"

import { apiReference } from "@scalar/nestjs-api-reference"

import { buildOpenApi, createApp } from "./bootstrap.js"
import { publicOpenApi } from "./public-openapi.js"

const { app, env } = await createApp()

const document = buildOpenApi(app)
// Developer API reference (public, every environment): key-usable routes only.
const publicDoc = publicOpenApi(document, env.API_URL)
app.getHttpAdapter().get("/v1/openapi.json", (_req, res) => res.send(publicDoc))
app.use("/docs/api", apiReference({ content: publicDoc, withFastify: true }))
// The full internal reference stays out of production.
if (env.NODE_ENV !== "production") {
  app.getHttpAdapter().get("/openapi.json", (_req, res) => res.send(document))
  app.use("/docs", apiReference({ content: document, withFastify: true }))
}

await app.listen({ port: env.PORT, host: "0.0.0.0" })
