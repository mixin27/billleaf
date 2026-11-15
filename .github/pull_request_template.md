## Summary

<!-- What does this PR change and why? Link the issue: Closes #123 -->

## Type of change

- [ ] feat — new feature
- [ ] fix — bug fix
- [ ] refactor / chore
- [ ] docs
- [ ] ci / build / infra

## Affected areas

- [ ] `apps/web`
- [ ] `apps/api` (incl. worker)
- [ ] `packages/db` (schema / migrations)
- [ ] `packages/contracts` / `packages/api-client`
- [ ] other packages / docs / infra

## Checklist

- [ ] PR title follows Conventional Commits (`feat(scope): ...`)
- [ ] `pnpm turbo lint typecheck test build` passes locally
- [ ] Tests added or updated
- [ ] DB migration generated and reviewed (if schema changed)
- [ ] New permissions added to the catalog in `packages/contracts` (if any)
- [ ] API client regenerated (`pnpm gen:api-client`) if the API contract changed
- [ ] Docs / ADR updated where relevant
- [ ] No secrets or `.env` files committed

## Screenshots / notes for reviewers

<!-- UI changes, rollout notes, follow-ups -->
