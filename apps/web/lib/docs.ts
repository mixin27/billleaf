import { env } from "./env"

/** A page on the docs site, e.g. `docsUrl("/docs/books/expenses")`. */
export const docsUrl = (path = "/docs") =>
  `${env.NEXT_PUBLIC_DOCS_URL.replace(/\/$/, "")}${path}`
