import "./instrument.js"
import "reflect-metadata"

import { apiReference } from "@scalar/nestjs-api-reference"

import { buildOpenApi, createApp } from "./bootstrap.js"

const { app, env } = await createApp()

if (env.NODE_ENV !== "production") {
  const document = buildOpenApi(app)
  app.getHttpAdapter().get("/openapi.json", (_req, res) => res.send(document))
  app.use("/docs", apiReference({ content: document, withFastify: true }))
}

await app.listen({ port: env.PORT, host: "0.0.0.0" })
