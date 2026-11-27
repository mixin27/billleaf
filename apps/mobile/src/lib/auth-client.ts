import { expoClient } from "@better-auth/expo/client"
import { organizationClient, twoFactorClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import * as SecureStore from "expo-secure-store"

import { API_URL, APP_SCHEME } from "./config"

/**
 * Better Auth for the app: the session cookie lives in the device keychain
 * (SecureStore) and goes out as a `Cookie` header with
 * `expo-origin: billleaf://` (ADR-0017). The Expo plugin sends every
 * request with `credentials: "omit"`, so no native cookie jar is involved.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/api/auth",
  plugins: [
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: "billleaf",
      cookiePrefix: "billleaf",
      storage: SecureStore,
    }),
    twoFactorClient(),
    organizationClient(),
  ],
})
