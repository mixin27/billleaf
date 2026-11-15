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
- Sentry releases tagged with the image sha; source maps uploaded in CI.

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
