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

- **Vocabulary in code, assignments in data.** `PERMISSION_CATALOG` in `packages/contracts/src/iam/permissions.ts` defines every key as `<resource>.<action>`. It is synced to `permissions` on boot/deploy.
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
