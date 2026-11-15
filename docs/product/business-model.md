# Business Model

> Documented, not built yet. Implementation lives in [Billing & entitlements](../architecture/billing-entitlements.md). Decision record: [ADR-0010](../adr/0010-merchant-of-record-billing.md).

## Freemium tiers

|                            | **Free**                   | **Pro**              | **Team / Agency** |
| -------------------------- | -------------------------- | -------------------- | ----------------- |
| Price (indicative)         | $0                         | ~$9–15 / month       | Per seat / month  |
| Workspaces                 | 1                          | 1+                   | 1+                |
| Members                    | 1                          | 1                    | Many (per seat)   |
| Clients                    | Limited (e.g. 3)           | Unlimited            | Unlimited         |
| Invoices / quotes          | Limited per month (e.g. 5) | Unlimited            | Unlimited         |
| PDF branding               | "Made with Billleaf"       | Custom logo & colors | Custom            |
| Recurring invoices         | —                          | ✓                    | ✓                 |
| Time tracking              | —                          | ✓                    | ✓                 |
| Custom roles & permissions | —                          | —                    | ✓                 |

Current values (code: `PLANS` in `@workspace/contracts`): Free — 1 member, 5 active clients, 10 issued invoices/month, 100 MB; Pro — US$12/mo or $120/yr, unlimited clients and invoices, 5 GB; Team — US$29/mo or $290/yr, unlimited members, 50 GB, custom roles. Prices are placeholders until the provider is live.
| Client portal (view documents, PDFs) | ✓ ("Made with Billleaf") | ✓ (your branding) | ✓ (your branding) |
| Approvals | — | — | ✓ |

- **Annual billing** at a discount (~2 months free).
- Numbers above are placeholders — real values live in the entitlements catalog, so pricing changes need **no code changes** in feature modules.

## Future revenue

- **Online invoice payments:** payment links via Stripe / PayPal on invoices; optional small platform fee.
- **Add-ons:** extra storage, e-signature, extra seats.

## Subscription billing provider

- Prefer a **Merchant of Record** — **Paddle** or **Lemon Squeezy**. The MoR is the legal seller, so it collects and remits global VAT/GST/sales tax and works for many company jurisdictions.
- Integrated behind a `BillingProvider` interface (checkout, portal, webhooks → normalized events) so Stripe Billing can replace it later.
- **Open item:** confirm provider availability for the operating company's country of incorporation and payout banking before choosing.

## Entitlements

- A workspace's plan resolves to a set of **entitlements**: limits (`clients.max`, `invoices.per_month`) and feature flags (`branding.custom`, `time.enabled`, `rbac.custom_roles`).
- Feature code only asks "is this allowed / within limit?" — it never checks plan names.
- Entitlements are separate from RBAC: RBAC is _who in the workspace may do it_, entitlements are _what the workspace has paid for_.

## Metrics to watch

MRR, Free→Pro conversion, churn, ARPA, activation (first invoice sent), invoices sent per active workspace.
