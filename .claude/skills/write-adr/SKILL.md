---
name: write-adr
description: Record an architecture decision for Billleaf as an ADR in docs/adr. Use when choosing or changing a technology, pattern, or infrastructure approach.
---

# Write an ADR

1. List `docs/adr/` and take the next number (`NNNN-kebab-title.md`).
2. Use `docs/adr/template.md` sections: Status (Proposed/Accepted/Superseded by NNNN),
   Date, Context, Decision, Consequences (positive and negative), Alternatives considered.
3. Keep it to one decision, under ~1 page, concrete (versions, limits, costs).
4. If it supersedes an ADR, update that ADR's status line to `Superseded by NNNN`.
5. Link it from `docs/README.md` ADR list and from the architecture doc it affects.
