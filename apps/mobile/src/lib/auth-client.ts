import { expoClient } from "@better-auth/expo/client"
import { organizationClient, twoFactorClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import * as SecureStore from "expo-secure-store"

import { API_URL, APP_SCHEME } from "./config"

/**
 * Better Auth for the app: the session cookie lives in the device keychain
 * (SecureStore) and goes out as a `Cookie` header with
 * `expo-origin: billleaf://` (ADR-0017).
 *
 * `credentials: "omit"` keeps Android's native cookie jar out of it. With
 * credentials on, React Native routes the request through OkHttp's jar,
 * which replaces our `Cookie` header with whatever the system cookie store
 * holds for the domain: a stale or not-yet-saved session from a
 * `Domain=`-scoped production cookie, so `get-session` came back empty and
 * sign-in looped. The keychain copy is the only one that's sent, as with
 * the API client (`lib/api.ts`).
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/api/auth",
  fetchOptions: { credentials: "omit" },
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
