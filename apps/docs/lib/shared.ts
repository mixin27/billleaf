import { createGetUrl } from "fumadocs-core/source"

export const appName = "Billleaf"
export const docsRoute = "/docs"
export const docsImageRoute = "/og/docs"

/** The Billleaf app (sign-in, pricing). Set at build time. */
export const appUrl = (
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
).replace(/\/$/, "")

/** The API, for the reference pages' base URL. */
export const apiUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "")

const getImageUrl = createGetUrl(docsImageRoute)

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "image.png"]
  return { segments, url: getImageUrl(segments, page.locale) }
}
