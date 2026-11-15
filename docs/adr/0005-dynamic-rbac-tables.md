# ADR-0005: Dynamic, workspace-scoped RBAC in our own tables

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

Agencies need custom roles (e.g. "Accountant: invoices but not projects"). Static roles in code can't be edited by customers; Better Auth's organization roles are coarse.

## Decision

Model RBAC in our tables: `permissions` (synced from a **code catalog** in `@workspace/contracts`), `roles` (always workspace-scoped; templates are code-defined `SYSTEM_ROLES`), `role_permissions`, `member_roles`. System templates (Owner, Admin, Member, Accountant) are cloned on workspace creation; Owner is immutable. Endpoints use `@RequirePermission('<resource>.<action>')` enforced by the global `WorkspaceGuard`, with per-(workspace, member) permission sets cached in Valkey and invalidated on change. `/me` returns effective permissions for UI gating. RBAC is kept separate from entitlements and platform admin.

## Consequences

- Customers can create roles without code changes; the permission vocabulary stays type-safe.
- Extra tables, cache invalidation logic, and seed/sync on deploy.
- New permissions for existing workspaces may need a data migration to grant them to cloned system roles.

## Alternatives considered

- **Hard-coded roles in code** — simplest, but no custom roles.
- **Better Auth org access control** — limited dynamic customization.
- **ABAC / policy engine (Casbin, Cerbos, OpenFGA)** — more power than needed now; can be layered in later if fine-grained rules emerge.
