"use client"

import { createOpenAPIPage } from "fumadocs-openapi/ui"

/** API reference pages. Static site: no "try it" playground. */
export const OpenAPIPage = createOpenAPIPage({
  playground: { enabled: false },
})
