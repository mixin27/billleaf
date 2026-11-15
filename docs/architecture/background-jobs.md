# Background Jobs

## Runtime

- **BullMQ** on **Valkey**.
- The `worker` is the same NestJS codebase as the API, started via `worker.ts` (no HTTP server, only queue processors and schedulers). Same Docker image, different command.
- Scale workers independently of the API (Dokploy replicas).

## When to use what

| Need                                                                   | Use                                         |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| Synchronous rule in the same transaction                               | Service call                                |
| Fire-and-forget in-process reaction (cheap)                            | `@nestjs/event-emitter` domain event        |
| Slow, retryable, or external I/O (PDF, email, webhooks, provider sync) | **BullMQ job**                              |
| Periodic work                                                          | BullMQ repeatable job (scheduler in worker) |

## Queues (planned)

| Queue               | Jobs                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email`             | verification, invitations, invoice/quote/receipt delivery (react-email from `@workspace/emails` → Resend)                                                                                             |
| `pdf`               | render quote/invoice/receipt PDFs → R2                                                                                                                                                                |
| `billing`           | retry provider webhook events that failed to apply on receipt (normally applied inline)                                                                                                               |
| `maintenance`       | workspace hard-delete, exports, cleanup of expired invitations/sessions                                                                                                                               |
| `recurring`         | hourly sweeps: generate due recurring invoices per workspace; `invoice-reminders` emails payment reminders (both idempotent)                                                                          |
| `exports`           | full data export: CSVs + every non-draft document PDF, zipped to `<workspace>/exports/` (only the latest kept) and emailed as a 3-day link; one per workspace at a time (deduplicated), concurrency 1 |
| `outbound-webhooks` | customer integrations (Phase 3)                                                                                                                                                                       |

## Job rules

- **Payload is small and serializable:** ids, not entities. Always include `workspaceId`; the processor sets CLS before using repositories.
- **Idempotent:** a job may run more than once. Use deterministic job ids (`invoice-pdf:<invoiceId>:<version>`) and check state before side effects.
- **Retries:** exponential backoff, default 5 attempts; failed jobs kept for inspection.
- **Transactional outbox for critical jobs:** enqueue after commit (or write an outbox row in the same transaction) so a rolled-back transaction never sends an email.
- Jobs live in the owning module: `modules/<feature>/jobs/`.
- Log with job id + `workspaceId`; failures go to Sentry.

## Local

`pnpm dev` runs api + worker; Mailpit at `http://localhost:8025` captures emails.
