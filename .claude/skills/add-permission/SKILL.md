---
name: add-permission
description: Add a new permission key to Billleaf's dynamic RBAC (catalog in packages/contracts) and grant it to the right system role templates. Use when a new resource/action needs authorization.
---

# Add a permission

1. Edit `packages/contracts/src/iam/permissions.ts`:
   - Add the action under its resource in `PERMISSION_CATALOG`
     (`resource: { action: "Human description" }`). Key = `resource.action`.
   - Decide which `SYSTEM_ROLES` templates get it. Owner gets everything
     automatically. Reads usually go to every role via `readAll`.
2. `pnpm --filter @workspace/contracts build && pnpm --filter @workspace/contracts test`.
3. The API syncs the catalog into the `permissions` table on boot (and the
   production `migrate` job). No migration needed.
4. Existing workspaces do **not** automatically get new grants on their cloned roles
   (roles are owned by the workspace). If existing roles must receive it, write a
   one-off data migration (SQL in a new drizzle migration) inserting into
   `role_permissions` for roles with the relevant `slug` and `is_system = true`, and
   mention it in the PR.
5. Use it: `@RequirePermission("resource.action")` in the API, `<Can permission="…">` in web.
