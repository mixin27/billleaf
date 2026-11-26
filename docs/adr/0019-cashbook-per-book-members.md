# ADR-0019: Cashbooks as their own module, with per-book members and computed balances

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** Billleaf maintainers

## Context

People record money in and out every day in a cashbook app (CashBook, cashbook.in). It works as a set of **books**, each with a running balance. A shop book is shared with staff, and a home book stays private. We want the same thing inside Billleaf.

Expenses don't fit this:

- they are business costs with vendors, tax and billable-to-client;
- they feed P&L.

A cashbook is simpler and more frequent: cash in, cash out, a balance.

Billleaf's access control so far is workspace-wide RBAC (ADR-0005): a permission like `expense.read` covers every expense in the workspace. A cashbook needs access **per book**. Staff should see the shop book and not the owner's personal one.

## Decision

1. **A separate module.** The module has these tables, all scoped by `workspace_id` like every business table:
   - `cashbooks`
   - `cashbook_members`
   - `cashbook_entries`
   - `cashbook_categories` and `cashbook_modes`
   - `cashbook_entry_files`

   Entries don't link to invoices, payments or expenses. Linking can come later as an opt-in.

2. **Per-book members.** `cashbook_members(book_id, member_id, role)` gives each workspace member a role in a book:
   - `owner`: everything, including members and deleting the book;
   - `admin`: any entry, plus categories and modes;
   - `operator`: adds entries, and edits or deletes their own for 24 hours;
   - `viewer`: read and export only.

   Whoever creates a book is its owner.

3. **Two workspace permissions** sit on top:
   - `cashbook.create`: create books;
   - `cashbook.manage`: see and act on every book as an owner, for workspace Owners and Admins.

   Cashbook routes use `@RequireWorkspace()`. A `CashbookAccess` service resolves the caller's book role, or `cashbook.manage`, and every service method checks it. A book you have no role in answers **404**, not 403, so its existence isn't revealed.

4. **Balances are computed, never stored.**
   - The book balance is `sum(in) − sum(out)` over entries that aren't deleted.
   - The running balance per entry is a window sum ordered by `(entry_date, entry_time, created_at, id)`. Ties fall back to `id` (UUIDv7, so creation order).
   - Editing or back-dating an entry needs no rebalancing.
5. **History through the audit log.** Entries are soft-deleted. Create, update (with before and after values), delete and move are recorded with `AuditService`, and the entry's activity is read back from there.
6. **One currency per book.** Amounts are positive minor units, and `type` (`in`/`out`) gives the direction. A book's currency can't change once it has entries, and entries only move between books with the same currency.

## Consequences

- People get private and shared books without changing workspace RBAC. Other modules are unaffected.
- This is a second access model to keep in mind. It applies only inside the cashbook module and goes through `CashbookAccess`; no other module should read `cashbook_members`.
- **Computed balances** are always right after edits and imports. The cost is a sum or window per query; it's served by the `(book_id, entry_date, entry_time)` index and paging. If books grow to hundreds of thousands of entries, we can add a per-day snapshot table without changing the API.
- **Plan limit:** `cashbooks` (active books), Free 2. Attachments count toward `storageMb`.
- **Backfill:** existing workspaces' system roles get the new permissions through a data migration, because permission sync only updates the locked Owner role.

## Alternatives considered

- **Reuse expenses (add income to it).** Rejected: it mixes daily cash with business costs and P&L, and it has no per-book privacy.
- **Workspace RBAC only (`cashbook.read` and so on).** Rejected: everyone with the permission would see every book, which breaks the shop and home split.
- **Store a running balance on each entry.** Rejected: every back-dated edit, delete or import would have to rewrite later rows, inviting drift and races.
