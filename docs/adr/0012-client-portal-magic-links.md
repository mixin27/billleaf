# ADR-0012: Client portal with emailed magic links, on every plan

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

Clients should see and act on their quotes, contracts and invoices without the freelancer recording every outcome by hand. Clients aren't Billleaf users: they won't create accounts or remember passwords, and their email is the identity the freelancer already has. The portal also has to be safe when emails are forwarded or opened by corporate mail scanners.

## Decision

- **Access by emailed link, no passwords.** On `/portal/{workspace}` a client enters their email. If it matches the client's email or one of its contacts (case-insensitive), we email a **single-use sign-in link** valid for 20 minutes, one link per matching client. The form gives the same answer either way, so it doesn't reveal who's a client.
- **Document emails carry their own link.** Quote, invoice, contract and receipt emails include a **reusable link** valid for 14 days that signs the recipient into that client's portal and opens the document.
- **Scanner-safe:** sign-in links land on a page that waits for a click, so a scanner fetching the URL doesn't use them up. Document links are reusable, so they continue automatically.
- **Sessions:** redeeming a link creates a 30-day **portal session** in `portal_sessions`. Its token is held in an HttpOnly, SameSite=Lax `billleaf_portal` cookie.
  - The session is scoped to one client of one workspace.
  - Only SHA-256 hashes of link and session tokens are stored.
  - The session grants no member permissions: `PortalGuard` sets the workspace and client in the request context, and every portal query checks the document belongs to that client and isn't a draft.
- **Available on every plan.** Free shows "Made with Billleaf"; paid plans show the workspace logo and colour (`customBranding`). This changes the earlier "Team only" line in the business model; approvals stay a Team feature.
- **Rollout:** this first version is read-only. It covers quotes, contracts, invoices, receipts and PDFs. Accepting or declining quotes and e-signing contracts come next, on the same sessions.

## Consequences

- No new auth system or user table for clients. Better Auth stays for members only, and the portal is a small, separate token mechanism we fully control.
- **Forwarding risk:**
  - A forwarded document email gives its holder 14 days of read access to that client's portal. That's the same exposure as the attached PDF, but wider. We accept this for the convenience.
  - A forwarded sign-in link is single-use and expires in 20 minutes.
- Sign-in requests are rate-limited per IP (throttler) and per email (5 per 15 minutes).
- Clients who share an email across workspaces get separate sessions per workspace. One browser holds one portal session at a time.

## Alternatives considered

- **One long-lived secret URL per client:** simplest, but anyone with the link has access until it's rotated, and it ends up in every email thread.
- **Client accounts with passwords:** high friction for clients, who don't come back often enough to remember them.
- **Portal only on Team:** clients accepting quotes and reading invoices online is core to the product for every freelancer, so gating it would hurt adoption more than it helps upgrades.
