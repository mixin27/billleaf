import { expect } from "@playwright/test"

import { MAILPIT_URL } from "./env"

type Summary = { ID: string; Subject: string; To: { Address: string }[] }

/** Wait for an email to `to` (optionally matching a subject) and return it. */
export async function waitForEmail(
  to: string,
  subject?: RegExp,
  timeout = 30_000
): Promise<{ subject: string; html: string; text: string }> {
  let found: Summary | undefined
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`
        )
        const body = (await res.json()) as { messages: Summary[] }
        found = body.messages.find((m) => !subject || subject.test(m.Subject))
        return Boolean(found)
      },
      { timeout, message: `email to ${to}${subject ? ` (${subject})` : ""}` }
    )
    .toBe(true)
  const msg = (await (
    await fetch(`${MAILPIT_URL}/api/v1/message/${found!.ID}`)
  ).json()) as { Subject: string; HTML: string; Text: string }
  return { subject: msg.Subject, html: msg.HTML, text: msg.Text }
}

/** The first link in an email whose URL matches `pattern`. */
export function linkIn(email: { html: string; text: string }, pattern: RegExp) {
  const links = [
    ...email.html.matchAll(/href="([^"]+)"/g),
    ...email.text.matchAll(/(https?:\/\/\S+)/g),
  ].map((m) => decodeEntities(m[1]!))
  const link = links.find((l) => pattern.test(l))
  if (!link) throw new Error(`No link matching ${pattern} in "${email.text}"`)
  return link
}

/** What a mail client shows for an href: &amp; / &#38; / &#x26; → &. */
function decodeEntities(v: string) {
  return v
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCharCode(parseInt(h, 16))
    )
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}
