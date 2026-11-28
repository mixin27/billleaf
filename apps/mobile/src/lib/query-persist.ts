import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { File, Paths } from "expo-file-system"

/**
 * The last loaded data, kept in the app's private storage so the app opens
 * with it (offline too) and refreshes in the background. One file;
 * removed on sign-out.
 */
const file = () => new File(Paths.document, "query-cache.json")

const storage = {
  getItem: async (_key: string) => {
    const f = file()
    return f.exists ? await f.text() : null
  },
  setItem: async (_key: string, value: string) => {
    const f = file()
    if (!f.exists) f.create()
    await f.write(value)
  },
  removeItem: async (_key: string) => {
    const f = file()
    if (f.exists) f.delete()
  },
}

export const queryPersister = createAsyncStoragePersister({
  storage,
  key: "billleaf-queries",
  throttleTime: 2000,
})

/** How long saved data stays usable. */
export const PERSIST_MAX_AGE = 7 * 24 * 3600_000

/** Forget the saved data (signing out). */
export async function clearPersistedQueries() {
  try {
    await storage.removeItem("")
  } catch {
    // Nothing saved.
  }
}
