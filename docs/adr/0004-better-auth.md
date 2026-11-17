# ADR-0004: Better Auth for authentication and workspaces

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

We need email/password, verification, magic link/OTP, Google OAuth, 2FA, platform admins, and multi-workspace membership with invitations — self-hosted, data in our Postgres, and usable later from an Expo mobile app.

## Decision

Use **Better Auth** mounted in the Nest API at `/api/auth/*` with the **Drizzle adapter**. Plugins: email+password, email verification, magic link / email OTP, Google, `twoFactor`, `admin` (platform staff), and **`organization` as the workspace primitive** (workspaces, members, invitations, active workspace on session). Passkey plugin later; `expo` added for the mobile app in [ADR-0017](0017-mobile-app-expo-native-auth.md). Session cookies on `.billleaf.com` shared by `app.` and `api.`; trusted origins configured.

## Consequences

- Users and sessions live in our DB; no per-MAU vendor cost or lock-in.
- Organizations give workspaces, invitations and active-workspace switching for free.
- We own security operations (secret rotation, rate limits, patching).
- Better Auth's built-in org roles are **not** used for authorization; our dynamic RBAC is ([ADR-0005](0005-dynamic-rbac-tables.md)).
- Nest integration must be verified against current Better Auth docs.

## Alternatives considered

- **Clerk / Auth0 / WorkOS** — fast to start, but per-MAU pricing, data outside our DB, harder org/RBAC customization.
- **Auth.js** — less complete for orgs, 2FA, and non-Next clients.
- **Hand-rolled auth** — unacceptable security risk and effort.
