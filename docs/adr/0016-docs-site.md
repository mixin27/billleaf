# ADR-0016: Public docs site with Fumadocs, statically exported

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** Billleaf maintainers

## Context

Billleaf has grown past what people can learn by clicking around: client portal, payment proofs, rates, expenses, credit notes, webhooks and API keys. Customers need task-first help pages; developers need API key and webhook guides and an endpoint reference. The only reference so far was the generated `/docs/api` page on the API server. There is no budget for another server, and the internal docs in `docs/` (architecture, ADRs, runbooks) must stay out of anything public.

## Decision

We will add **`apps/docs`**, a [Fumadocs](https://fumadocs.dev) site on Next.js 16, exported as **static files** (`output: "export"`):

- **Content:** MDX in `apps/docs/content/docs`, grouped as Getting started, Selling, Work, Getting paid, Books, Client portal, Account and data, Developers. Written for customers in the product's own UI labels. English only.
- **Search:** Fumadocs' static Orama index, built at build time and searched in the browser. No server routes.
- **API reference:** generated from the **public** OpenAPI document (the key-usable subset, [ADR-0015](0015-workspace-api-keys.md)). `pnpm gen:api-client` also writes `apps/api/openapi.public.json`; `pnpm --filter docs gen:api` copies it to `apps/docs/openapi/public.json` and runs `fumadocs-openapi` `generateFiles` into `content/docs/developers/api-reference/`. The spec and generated MDX are committed, so the docs build needs neither the API nor Valkey. "Try it" is off.
- **Brand:** shares `@workspace/brand` (logo, icons, Open Graph image) with the web app.
- **Hosting:** any free static host (Cloudflare Pages, or Vercel for non-commercial use); see [Deployment](../infrastructure/deployment.md#docs-site).
- **Internal docs stay in `docs/`** and are never published.

## Consequences

- Help pages live next to the code: a PR that changes a feature's UI updates its page in the same PR.
- The API reference only changes when someone regenerates it; CI doesn't check that it's current.
- The web app links to the docs via `NEXT_PUBLIC_DOCS_URL` (Help menu, marketing header and footer, API keys, webhooks, expenses, reports).

## Alternatives considered

- **Nextra** — similar, but Fumadocs has first-class OpenAPI pages and fits our Tailwind v4 setup.
- **Mintlify / GitBook / ReadMe** — hosted and polished, but paid for custom domains and content lives outside the repo.
- **Docs pages inside `apps/web`** — couples help content to app deploys and the app's auth proxy; a static site is free to host and can't break the product.
