# Developer API

Workspaces on Pro and Team can call the REST API from their own scripts and tools with an **API key** (Settings → API keys). Design: [ADR-0015](../adr/0015-workspace-api-keys.md). Pair it with [webhooks](webhooks.md) to react to events.

## Authenticating

```bash
curl https://api.billleaf.example/v1/clients \
  -H "Authorization: Bearer blk_…"
```

- A key belongs to one workspace; no `X-Workspace-Id` is needed (sending a different one is refused).
- It **acts as the member who created it**, limited to the permissions picked for it — and never more than that member can do now. Audit entries show the person and "via API key _name_".
- Keys are shown once. Billleaf stores only a hash. Revoke a key any time; keys can expire after 30, 90 or 365 days.

## What a key can reach

Clients, quotes, contracts, projects and tasks, time, invoices, recurring invoices, payments and receipts, and reading the workspace profile — as allowed by its scopes. Never: billing, members, roles, settings, webhooks, API keys, rates, data export, workspace deletion, `/v1/me`, or the admin portal.

Reference: `GET /v1/openapi.json`, browsable at `/docs/api`.

## Errors

Problem+JSON with a `code`:

| Status | `code`                       | Meaning                                                |
| ------ | ---------------------------- | ------------------------------------------------------ |
| 401    | `invalid_api_key`            | Unknown, revoked or expired key                        |
| 403    | `api_key_scope_missing`      | The key (or its creator) lacks the needed permission   |
| 403    | `api_key_wrong_workspace`    | `X-Workspace-Id` names another workspace               |
| 403    | `not_available_with_api_key` | This endpoint needs a signed-in person                 |
| 403    | `feature_not_in_plan`        | The workspace's plan doesn't include the Developer API |
| 429    | —                            | More than 120 requests a minute with this key          |

## Conventions

- Money is integer minor units plus an ISO currency (`12345` USD = 123.45).
- Lists are paged: `?page=1&pageSize=25`, responses have `items`, `total`, `page`, `pageSize`.
- Issued invoices and receipts can't be edited, only voided or credited.

## Internals

- `api_keys` (hash, prefix, scopes, creator member, expiry, last use, revoked) and `audit_logs.api_key_id`; see [data model](data-model.md).
- `AppAuthGuard` (bearer → key, else Better Auth session) → `WorkspaceGuard` key branch → `AppThrottlerGuard` (per-key limit). `@SessionOnly()` marks routes keys may never use.
- Rate-limit counters are kept in Valkey, so the 120/minute per key holds across API instances.
