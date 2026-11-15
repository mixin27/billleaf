# Git Workflow

## Trunk-based development

- `main` is always deployable; it auto-deploys to **staging**.
- Short-lived branches (≤ 2–3 days): `feat/<scope>-<short-desc>`, `fix/…`, `chore/…`, `docs/…`.
- Merge via PR with **squash merge**; the PR title becomes the commit message (so it must be a conventional commit).
- Incomplete features ship behind flags/entitlements rather than living on long branches.
- Production releases: tag `vX.Y.Z` on `main` → approval → production ([deployment](../infrastructure/deployment.md)).

## Conventional commits

Enforced by commitlint (`commit-msg` hook via lefthook).

```
<type>(<scope>): <subject>

feat(api): add role CRUD endpoints
fix(web): keep workspace slug on sign-in redirect
docs(docs): add backup runbook
```

- **Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`, `build`.
- **Scopes:** `web`, `api`, `mobile`, `docs`, `ui`, `db`, `contracts`, `api-client`, `env`, `emails`, `infra`, `ci`, `deps`, `repo` (see `commitlint.config.mjs`).
- Breaking changes: `feat(api)!: …` plus a `BREAKING CHANGE:` footer.
- Subject: imperative, lower case, no trailing period, ≤ 72 chars.

## Pull requests

- Small and focused; one concern per PR.
- Fill in the PR template: what, why, how tested, screenshots for UI, migration notes.
- Required checks: lint, typecheck, tests, build. At least one review (CODEOWNERS) once the team grows.
- Include docs/ADR updates and migrations in the same PR as the code that needs them.

## Hooks (lefthook)

| Hook         | Runs                     |
| ------------ | ------------------------ |
| `pre-commit` | Prettier on staged files |
| `commit-msg` | commitlint               |

Installed automatically by `pnpm install` (`prepare` script).
