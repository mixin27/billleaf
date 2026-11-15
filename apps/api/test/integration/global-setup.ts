import { resetTestDatabase } from "@workspace/db/testing"

import { testDatabaseUrl } from "./test-db.js"

/** Create (if needed), wipe and migrate the test database once per run. */
export default async function setup() {
  await resetTestDatabase(testDatabaseUrl())
}
