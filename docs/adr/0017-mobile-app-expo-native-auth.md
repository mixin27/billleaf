# ADR-0017: Mobile app on Expo, signed in through Better Auth's expo plugin

- **Status:** Accepted
- **Date:** 2026-11-17
- **Deciders:** Billleaf maintainers

## Context

Phase 4 adds a phone app (`apps/mobile`), starting with time tracking (sign in, workspace, dashboard, timer, favourites). The roadmap assumed it would use the API "unchanged", but the API is cookie-only, and Better Auth refuses cookie-bearing `POST /api/auth/*` requests (sign-out, switching workspace, 2FA) that have no `Origin` header. Native HTTP clients don't send one. Account creation, email verification and workspace creation already work on the web and don't need to move.

## Decision

- **App:** Expo **SDK 58** (React Native 0.88.1, React **19.3.0** — the version its renderer is built for; the web stays on 19.3.1, each app bundles its own), **expo-router**, development builds (not Expo Go), plain `StyleSheet` with brand tokens, iOS and Android from one codebase. pnpm's isolated linker stays; the app has no `build`/`dev` script, so CI runs only its lint, typecheck and unit tests.
- **Auth:** the API adds Better Auth's **`expo()` plugin** (`@better-auth/expo@1.7.25`) and trusts the app scheme **`billleaf://`** (`MOBILE_APP_ORIGIN`, not a CORS origin). The app uses `@better-auth/expo/client`: the session cookie is kept in the device keychain (expo-secure-store) and sent as a `Cookie` header with `expo-origin: billleaf://`, which the plugin turns into `Origin` for Better Auth's check. Calls to `/v1/*` use the same `Cookie` header plus `X-Workspace-Id`, with `credentials: "omit"`.
- **Origin check on everywhere:** `advanced.disableOriginCheck: false`, because Better Auth otherwise skips the check when `NODE_ENV=test`; integration tests now prove a missing or untrusted origin gets 403.
- **The app signs in only.** Create account and forgot password open the web (`/sign-up`, the new `/forgot-password`); workspaces are created on the web.

## Consequences

- One small API change (a plugin and a trusted scheme), no schema change, no new auth system; web, API keys and the portal are unaffected (API keys still match only `Bearer blk_…`).
- `expo-origin` can't be abused from a browser: a cross-site page can't send it without a CORS preflight, which `bootstrap.ts` rejects.
- Same session rules as the web (5-minute cookie cache after sign-out; the app clears its stored cookie locally).
- Expo Go isn't supported out of the box (it uses `exp://` origins); add `exp://**` to a local `TRUSTED_ORIGINS` to use it.
- Follow-ups: push notifications, deep links for magic links / invitations, store builds (EAS), and sharing pure helpers (date maths) between web and mobile once a third consumer exists.

## Alternatives considered

- **Bearer tokens (`bearer` plugin)** — also works, but adds a second session transport and token handling; the Expo plugin is Better Auth's supported path and keeps one cookie-based session model.
- **Workspace API keys** — tied to one workspace and a plan feature, refused on session-only routes like `/v1/me`; not a login.
- **Turning the origin check off for native requests** — removes CSRF protection for everyone.
- **NativeWind / Tamagui** — more tooling and version coupling than a first slice needs.
