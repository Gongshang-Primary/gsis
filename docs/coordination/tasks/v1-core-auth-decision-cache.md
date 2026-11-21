# Task Claim: v1 Core-to-Contacts Authority Read Cache (D01/D02)

- Task ID: `v1-core-auth-decision-cache`
- Model: `Antigravity`
- Branch: `antigravity/v1-core-auth-decision-cache`
- Reviewer: `Muse` (exact-head review)
- Coordinator / Merger: `GPT`
- Scope: Add a bounded `validUntil`-scoped in-isolate authority read cache in Core (`v1/services/core/auth-cache.mjs` wired into `v1/services/core/service.mjs` and invalidated by `v1/services/contacts/service.mjs`):
  - Caches verified Contacts `/internal/authority` reads for derived-capability **read** authorizations (`!d.write`), keyed per `(dbRef, schoolId, staffId, sessionId)` with bounded LRU capacity (500 entries) and strict TTL `Math.min(now + 15000, observationValidUntil)` — never extending past `validUntil`, session expiry, or next interval boundary.
  - Never caches `unavailable`, `stale`, or error outcomes (fail-closed) and always reads Contacts fresh on mutating writes (`d.write === true`).
  - Explicitly invalidates cached entries on Core `POST /logout`, Core account suspension/grant/linkage changes, and Contacts authority/staff commits via `POST /internal/authority-cache/invalidate`.

## Files Claimed
- `docs/coordination/tasks/v1-core-auth-decision-cache.md`
- `v1/services/core/auth-cache.mjs`
- `v1/services/core/service.mjs`
- `v1/services/contacts/service.mjs`
- `tests/v1-product-core-auth-cache.mjs`

## Constraints
- Zero v0.9 changes (`npm run build` zero drift).
- Preserve all Core fail-closed security invariants and exact Contacts authority verification semantics.
