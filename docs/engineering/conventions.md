# Engineering Conventions

## General

- **TypeScript strict** everywhere; no `any` without a comment explaining why.
- **ESM** modules; Node ≥ 22 (`.nvmrc`).
- **Prettier** formats (enforced by lefthook pre-commit); **ESLint** catches the rest.
- **Zod** is the one validation library: env, DTOs, forms, contracts.
- Prefer small, pure functions; no premature abstractions; delete dead code.

## Naming

| Thing             | Convention                                              | Example                                          |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Files             | `kebab-case`                                            | `invoice-line-editor.tsx`, `invoices.service.ts` |
| React components  | `PascalCase` export                                     | `InvoiceLineEditor`                              |
| Hooks             | `useX`                                                  | `useInvoices`                                    |
| Zustand stores    | `useXStore` in `stores/`                                | `useInvoiceDraftStore`                           |
| Zod schemas       | `xSchema`, type `X = z.infer<…>`                        | `createInvoiceSchema`, `CreateInvoiceInput`      |
| DB tables/columns | `snake_case`, plural tables                             | `invoice_lines.amount_minor`                     |
| Permission keys   | `<resource>.<action>` (singular resource)               | `invoice.create`                                 |
| Entitlement keys  | `<area>.<limit                                          | flag>`                                           | `clients.max`, `time.enabled` |
| Events            | `<entity>.<past-tense>`                                 | `invoice.issued`                                 |
| Queues / jobs     | `kebab-case`                                            | `pdf`, `render-invoice-pdf`                      |
| Env vars          | `SCREAMING_SNAKE_CASE`; web public ones `NEXT_PUBLIC_*` | `DATABASE_URL`                                   |
| Packages          | `@workspace/<name>`                                     | `@workspace/contracts`                           |

## Money, dates, ids

- Money: **integer minor units + ISO currency**; format only at the edge (`Intl.NumberFormat`). Use helpers in `@workspace/contracts` (`common/money`).
- Dates: store `timestamptz` (UTC); send ISO 8601; render in the workspace/user timezone. Date-only fields (invoice due date) as `date`.
- IDs: UUIDv7 strings; never expose sequential DB ids; document numbers (`INV-0001`) are for humans.

## API

- REST `/v1`, plural nouns, `kebab-case` paths: `GET /v1/invoices/:id`, `POST /v1/invoices/:id/void`.
- Errors as RFC 9457 problem+json; validation errors list field paths.
- Cursor pagination; filter params via query string.
- Controllers → services → repositories ([api.md](../architecture/api.md)).

## Web

- Feature folders with a public `index.ts`; no cross-feature deep imports ([web.md](../architecture/web.md)).
- Server state in TanStack Query only; UI state in Zustand; URL state in `nuqs`.
- Accessible by default (shadcn/Base UI primitives, labels, keyboard support).

## Comments & docs

- Comment _why_, not _what_.
- A decision that changes architecture → new ADR ([template](../adr/template.md)).
- Update the relevant `docs/` page in the same PR as the change.
