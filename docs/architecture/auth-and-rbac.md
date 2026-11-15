# Auth & RBAC

Decisions: [ADR-0004 Better Auth](../adr/0004-better-auth.md) · [ADR-0005 Dynamic RBAC tables](../adr/0005-dynamic-rbac-tables.md)

## Authentication — Better Auth

- Mounted in the Nest API at **`/api/auth/*`** via `@thallesp/nestjs-better-auth` (`apps/api/src/auth/`). Plugins are defined in `auth.plugins.ts`; `pnpm --filter api auth:generate` derives `packages/db/src/schema/auth.ts` from them.
- Role changes through Better Auth's `/organization/update-member-role` are disabled — use `PUT /v1/members/:id/roles`. On join, Better Auth's `member.role` string is used once as the slug of the workspace role to grant.
- **Drizzle adapter**; auth tables live in `packages/db`.
- **Plugins:** email + password, email verification, magic link / email OTP, Google OAuth, `twoFactor`, `admin` (platform staff), **`organization` as the workspace primitive** (workspaces, members, invitations, active workspace on session). Later: passkey, `expo` (mobile).
- **Cookies** on the parent domain (`COOKIE_DOMAIN=.billleaf.com`) so `app.` and `api.` share the session. `TRUSTED_ORIGINS` restricts credentialed origins (CSRF protection).
- Web uses `better-auth/react`; mobile will use the Expo client.

## Three separate concerns

| Concern            | Question                                                             | Mechanism                                                                                      |
| ------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **RBAC**           | May this _member_ do this in this workspace?                         | `@RequirePermission` + `WorkspaceGuard`                                                        |
| **Entitlements**   | Has this _workspace's plan_ got this feature / room under the limit? | `EntitlementsService.assertWithinLimit()` — [billing-entitlements.md](billing-entitlements.md) |
| **Platform admin** | Is this Billleaf staff?                                              | Better Auth `admin` plugin `user.role` — never mixed with workspace roles                      |

## Dynamic RBAC

```
permissions        key ('invoice.create') PK, resource, action, description     ← synced from code catalog
roles              id, workspace_id (NOT NULL), slug, name, description, is_system, is_locked
role_permissions   role_id, permission_key
member_roles       workspace_id, member_id, role_id   (member = Better Auth organization member)
```

- **Vocabulary in code, assignments in data.** `PERMISSION_CATALOG` in `packages/contracts/src/iam/permissions.ts` defines every key as `<resource>.<action>`. It is synced to `permissions` on boot/deploy, and the sync grants every key to locked (Owner) roles, so owners of existing workspaces get new keys automatically. Other existing roles only get a new key through a data migration.
- **System role templates** live in code (`SYSTEM_ROLES` in `@workspace/contracts`), not in the DB. On workspace creation (`WorkspaceBootstrapService`, from Better Auth's `afterCreateOrganization` hook) they are **cloned** into workspace-scoped roles. **Owner is immutable** and a workspace must always keep at least one Owner.
- Workspaces can create custom roles and change role ↔ permission mappings at runtime (Team plan entitlement).
- A member may hold several roles; effective permissions = union.

### Enforcement

```ts
@Post()
@RequirePermission("invoice.create")
create(@Body() dto: CreateInvoiceDto) { … }   // workspace comes from RequestContext
```

Global guard order (`app.module.ts`): `ThrottlerGuard → AuthGuard → WorkspaceGuard`.

1. `AuthGuard` (Better Auth) requires a session unless the route is `@AllowAnonymous()`.
2. `WorkspaceGuard` (for routes with `@RequirePermission` / `@RequireWorkspace`) resolves the workspace from the `X-Workspace-Id` header or the session's active organization, verifies membership (403 otherwise) and loads the member's permission set via `PermissionResolver` (Valkey, falling back to DB). It fills `RequestContext` (`userId`, `workspaceId`, `memberId`, `permissions`).
3. Cache keys are versioned per workspace (`rbac:v:<ws>`); `PermissionResolver.invalidateWorkspace()` bumps the version on any role, role-permission or membership change.
4. Guardrails: the locked Owner role cannot be edited/deleted, only owners can grant Owner, and a workspace must keep at least one Owner.

### UI gating

`GET /v1/me` returns the user, active workspace and **effective permission keys**. The web uses them to hide/disable UI. This is cosmetic; the API is always the authority.

## Platform admin

Billleaf staff run the platform from `/admin` in the web app (API: `/v1/admin/*`, `apps/api/src/admin/`). It is separate from workspace RBAC: a platform admin has no extra rights inside workspaces.

- **Who:** users whose email is in `PLATFORM_ADMIN_EMAILS` (comma-separated). On boot, `AdminAccessService` sets `user.role = "admin"` for them and demotes anyone else. Nobody can become an admin from the UI.
- **Guard:** `PlatformAdminGuard` on every `/v1/admin/*` route:
  - 404 unless the user's email is in the list (the portal's existence isn't revealed);
  - 403 `admin_impersonating` from an impersonated session;
  - 403 `admin_2fa_required` until the admin turns on two-factor (Your account → Two-factor authentication).
- **Better Auth admin routes:** most are disabled (`DISABLED_ADMIN_PATHS` in `auth.ts`). Ban, unban, session revoke and plan changes go through `/v1/admin`, which checks targets (not yourself, not another admin) and writes `admin.*` audit entries with the reason.
- **Impersonation** ("Sign in as user"):
  1. `POST /v1/admin/users/:id/impersonation { reason }` checks the target, audits `admin.impersonation_started`, and stores a one-time permission in Valkey (2 minutes).
  2. The browser calls Better Auth `/admin/impersonate-user`. A `before` hook consumes that permission and refuses without it.
  3. The new session lasts 1 hour and has `session.impersonatedBy` set. `/v1/me` returns `user.impersonatedBy`, and the app shows a red banner with **Stop** (`/admin/stop-impersonating`).
  4. Actions taken meanwhile are attributed to the user; the session row and the start entry tie them to the admin.
- **Sections:** overview, workspaces (set a plan by hand, with a reason), users (ban, unban, sign out everywhere, resend verification, impersonate), background jobs (retry, remove), and the platform-wide audit log.

## Two-factor authentication

Better Auth `twoFactor` (TOTP + backup codes). Users turn it on under **Your account**; sign-in then asks for an authenticator code or a backup code, with an option to trust the device. Required for platform admins.

## Audit log

`AuditService.record()` writes `audit_logs` with the actor, workspace, IP address and user agent. Workspace owners read their own log at **Settings → Audit log** (`GET /v1/audit`, `audit.read`). Platform admins read every workspace's at `/admin/audit`.

## Members & invitations

- `GET/POST /v1/invitations`, `POST /v1/invitations/:id/resend`, `DELETE /v1/invitations/:id` (`member.invite`); `DELETE /v1/members/:id` (`member.remove`); `PUT /v1/members/:id/roles` (`member.update`).
- Invitations are rows in Better Auth's `invitation` table (built-in role `member`) plus `invitation_roles` (the workspace role to grant). Better Auth's own invite/remove/cancel/update-role endpoints are **disabled**; its accept/reject/get-invitation endpoints are used by the web `/accept-invitation/:id` page. On acceptance, `WorkspaceBootstrapService.onInvitationAccepted` replaces the member's roles with the invited role.
- Seats: members + live pending invitations count against `PLANS[plan].limits.members`.
- Guardrails: only owners can invite or remove owners; the last owner cannot be removed or demoted.

## Adding a permission

1. Add the key to `PERMISSION_CATALOG` (and to relevant `SYSTEM_ROLES`).
2. Use `@RequirePermission("<resource>.<action>")` on the endpoint.
3. Deploy — the sync adds it to `permissions`. Existing workspaces get new system-role grants via a data migration if needed.

Skill: `.claude/skills/add-permission`.
