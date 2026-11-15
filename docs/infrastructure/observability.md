# Observability

| Signal          | Tool                                                                       | Source                                            |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| Errors          | **Sentry**                                                                 | web (client + server), api, worker                |
| Logs            | **Pino** JSON → **Loki** → Grafana                                         | api, worker (stdout, collected by Promtail/Alloy) |
| Traces          | **OpenTelemetry** → Tempo (or Sentry performance)                          | api, worker, Postgres/HTTP instrumentation        |
| Metrics         | Prometheus-compatible (node, Postgres, Valkey, BullMQ exporters) → Grafana | VPS                                               |
| Uptime / status | **Uptime Kuma** (status page); Better Stack optional                       | `/health` endpoints, web                          |

Start lean: Sentry + Uptime Kuma + Dokploy logs on day one; add the Grafana stack (Loki/Tempo/Prometheus) when traffic justifies it.

## Logging rules

- Structured JSON only; one line per event.
- Every log carries `requestId` (or `jobId`), `userId`, `workspaceId` when known.
- **Never log** secrets, tokens, cookies, passwords, full request bodies, or client financial details. Pino `redact` is configured for auth headers and known sensitive fields.
- Levels: `error` (needs action), `warn` (unexpected but handled), `info` (lifecycle, business events), `debug` (local only).

## Tracing

- `requestId` propagated web → api via `x-request-id`; jobs carry the originating `requestId`.
- Sentry releases tagged with the image sha (`SENTRY_RELEASE`); source-map upload in CI is a follow-up (needs a Sentry auth token).

## Sentry setup (implemented)

| Where         | File                                                                                                                    | Enabled by                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| API + worker  | `apps/api/src/instrument.ts` (loaded with `node --import ./dist/instrument.js`, also imported first by the entrypoints) | `SENTRY_DSN`                             |
| API errors    | `ProblemDetailsFilter` (`@SentryExceptionCaptured`): unexpected errors only, never 4xx                                  | —                                        |
| Web (browser) | `apps/web/instrumentation-client.ts`                                                                                    | `NEXT_PUBLIC_SENTRY_DSN`                 |
| Web (server)  | `apps/web/instrumentation.ts` (`onRequestError`) and `app/global-error.tsx`                                             | `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` |

Tracing comes from Sentry's OpenTelemetry-based instrumentation (`SENTRY_TRACES_SAMPLE_RATE`, default 0.1). **Data policy:** `SENTRY_DATA_COLLECTION` in `@workspace/env` turns off request bodies, cookies, headers, query strings and automatic user info everywhere. Session Replay is deliberately not enabled.

## Alerts (minimum)

| Alert            | Threshold                                                                |
| ---------------- | ------------------------------------------------------------------------ |
| API or web down  | Uptime Kuma: 2 consecutive failures                                      |
| Error spike      | Sentry: new issue or > N events / 5 min                                  |
| Disk usage       | > 80%                                                                    |
| Postgres backups | No successful dump in 26 h / WAL archive lag > 15 min                    |
| Queue backlog    | BullMQ waiting jobs > threshold for 10 min; failed jobs > 0 in `billing` |
| TLS expiry       | < 14 days                                                                |

Alerts route to email + a chat channel; production alerts page the on-call person.
