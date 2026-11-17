import { expect, type Page } from "@playwright/test"

import { API_URL, WEB_URL } from "./env"

/**
 * Call the API as the signed-in user of `page` (shares its cookies), in the
 * workspace `slug`. For test setup that isn't the journey under test.
 */
export async function api<T = any>(
  page: Page,
  slug: string,
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  data?: unknown
): Promise<T> {
  const org = await page.request.get(
    `${API_URL}/api/auth/organization/get-full-organization?organizationSlug=${slug}`,
    { headers: { origin: WEB_URL } }
  )
  expect(org.ok(), await org.text()).toBe(true)
  const { id } = (await org.json()) as { id: string }
  const res = await page.request.fetch(`${API_URL}${path}`, {
    method,
    headers: { origin: WEB_URL, "x-workspace-id": id },
    data,
  })
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true)
  return (res.status() === 204 ? undefined : await res.json()) as T
}
