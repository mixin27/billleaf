import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  assertAllowedUrl,
  isPrivateAddress,
  signatureHeader,
  UnsafeTargetError,
} from "./safe-http.js"

describe("webhook targets", () => {
  it("knows private and public addresses", () => {
    for (const a of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
    ])
      expect(isPrivateAddress(a), a).toBe(true)
    for (const a of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])
      expect(isPrivateAddress(a), a).toBe(false)
  })

  it("allows only public https URLs unless private targets are allowed", () => {
    expect(assertAllowedUrl("https://hooks.example.com/x", false).host).toBe(
      "hooks.example.com"
    )
    for (const bad of [
      "http://hooks.example.com",
      "https://localhost:3000/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://169.254.169.254/latest",
      "https://user:pass@example.com",
      "ftp://example.com",
      "not a url",
    ])
      expect(() => assertAllowedUrl(bad, false), bad).toThrow(UnsafeTargetError)
    expect(assertAllowedUrl("http://127.0.0.1:9999/x", true).port).toBe("9999")
  })

  it("signs the timestamp and raw body", () => {
    const header = signatureHeader("whsec_test", '{"a":1}', 1_700_000_000)
    const expected = createHmac("sha256", "whsec_test")
      .update('1700000000.{"a":1}')
      .digest("hex")
    expect(header).toBe(`t=1700000000,v1=${expected}`)
  })
})
