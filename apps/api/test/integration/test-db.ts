/** Resolve the integration-test database URL; refuse anything not clearly a test DB. */
export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL
  const base =
    process.env.DATABASE_URL ??
    "postgres://billleaf:billleaf@localhost:5432/billleaf"
  const url = new URL(explicit ?? base)
  if (!explicit && !url.pathname.endsWith("_test"))
    url.pathname = "/billleaf_test"
  if (!url.pathname.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against non-test database ${url.pathname}`
    )
  }
  return url.toString()
}
