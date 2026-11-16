import { createHmac } from "node:crypto"
import dns from "node:dns"
import http from "node:http"
import https from "node:https"
import { BlockList, isIP } from "node:net"

/**
 * Outgoing webhook HTTP: refuses private, loopback, link-local and other
 * non-public addresses (checked on the address actually connected to, so
 * DNS rebinding can't sneak past), never follows redirects, times out, and
 * reads at most 1 KB of the response.
 */

const blocked = new BlockList()
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, prefix, "ipv4")
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, prefix, "ipv6")

/** True for any address that isn't on the public internet. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return blocked.check(address, "ipv4")
  if (family === 6) {
    // IPv4-mapped (::ffff:10.0.0.1) → check the IPv4 part.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
    if (mapped) return blocked.check(mapped[1]!, "ipv4")
    return blocked.check(address, "ipv6")
  }
  return true
}

export class UnsafeTargetError extends Error {}

/**
 * Checks that can be made without DNS (on save and before sending):
 * http(s) only (https unless private targets are allowed), no
 * credentials, and no literal private address or localhost.
 */
export function assertAllowedUrl(raw: string, allowPrivate: boolean): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeTargetError(
      "Enter a full URL, e.g. https://example.com/hook"
    )
  }
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:"))
    throw new UnsafeTargetError("Webhook URLs must use https://")
  if (url.username || url.password)
    throw new UnsafeTargetError("Don't put a username or password in the URL")
  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      (isIP(host) && isPrivateAddress(host))
    )
      throw new UnsafeTargetError("Webhook URLs must point to a public address")
  }
  return url
}

/** `t=<unix>,v1=<hex HMAC-SHA256(secret, "t.body")>` */
export function signatureHeader(secret: string, body: string, t: number) {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")
  return `t=${t},v1=${v1}`
}

type LookupCb = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number
) => void

/** DNS lookup that fails when any resolved address is private. */
function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  cb: LookupCb
) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, [])
    const list = addresses as dns.LookupAddress[]
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address)))
      return cb(
        new UnsafeTargetError(
          `${hostname} resolves to a private address`
        ) as NodeJS.ErrnoException,
        []
      )
    if (options.all) cb(null, list)
    else cb(null, list[0]!.address, list[0]!.family)
  })
}

export interface PostResult {
  status: number
  body: string
}

export function postJson(
  url: URL,
  body: string,
  headers: Record<string, string>,
  opts: { allowPrivate: boolean; timeoutMs: number }
): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http
    const req = client.request(
      url,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
        lookup: opts.allowPrivate ? undefined : (safeLookup as never),
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (c: Buffer) => {
          if (size < 1024) chunks.push(c)
          size += c.length
          if (size >= 1024) res.destroy()
        })
        const done = () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8").slice(0, 1024),
          })
        res.on("end", done)
        res.on("close", done)
        res.on("error", done)
      }
    )
    req.setTimeout(opts.timeoutMs, () =>
      req.destroy(new Error(`Timed out after ${opts.timeoutMs / 1000} s`))
    )
    req.on("error", reject)
    req.end(body)
  })
}
