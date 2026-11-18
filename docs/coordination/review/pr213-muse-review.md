# Muse review — PR #213: fix Calendar multi-room event validation

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #213, branch `codex/v1-calendar-multi-venue`, OPEN, MERGEABLE, draft for review.
- Exact head reviewed: `4f959c5e2fde2bc0ce06701c85b96226683faaf4`.
- Base (claim): `1abe47d039befd685a02c03ef8116278a12a2711` (merge-base of the head against origin/main at review time; refreshed source baseline `360853c3`).
- Verdict: **APPROVED at the exact head.**

## What it fixes

Calendar's native picker submits multiple selected room IDs as one comma-separated field. The Worker compared that whole field with a single directory ID and rejected valid multi-room events with `409 INVALID_VENUE`. The repair validates each of up to six distinct IDs against the existing school directory, keeps their order, and leaves display labels and custom location text untouched.

## Scope verified

- Diff is exactly the four paths in the task record `docs/coordination/tasks/v1-calendar-multi-venue.md`: the task record, `tests/v1-product-calendar-venues.mjs`, `tests/v1-product-calendar-venues-browser.mjs`, `v1/services/calendar/service.mjs`. 222 insertions, 4 deletions.
- `git merge-tree --write-tree --name-only origin/main 4f959c5` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No shared builder, v0.9 source, Venues implementation, migration, infrastructure or provider configuration change. No deployment. No live data change.

## Design read

- `v1/services/calendar/service.mjs` (`eventMutation`): when `e.VenueID` is present, it is split on commas and trimmed; the selection must be at most six distinct nonempty IDs, and every ID must exist in the authenticated school catalogue (same `serviceCall` to the Venues catalogue, purpose `calendar`). The stored value is re-joined from the trimmed IDs, so spacing is normalised and order preserved. `Location` is neither parsed nor rewritten — comma-bearing room labels and free-text custom locations pass through untouched. A Calendar selection does not reserve a room. Existing authority, revision guards, operation receipts, provider-failure semantics and the cross-service observation-to-commit interval are unchanged; no cross-D1 atomicity is claimed.

## CI verified at the exact head

- Node/LORD run 44409702349: head_sha verified `4f959c5`, completed success, all five jobs green.
- Product run 44409772377: head_sha verified `4f959c5`, completed success.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-calendar-venues.mjs` — PASS (actual D1: ordered 1/2/6 rooms, literal labels/custom text, malformed/duplicate/foreign/seventh IDs rejected with no partial event/year/sync/audit writes, partial edit, copy/move, stale revision, changed-intent refusal, idempotent replay after restart, capability/impersonation, provider outage → 503 `DEPENDENCY_UNAVAILABLE`, custom-only text skips the directory read).
- `node tests/v1-product-calendar-venues-browser.mjs` — PASS (unchanged native picker → real local Core/Calendar/Venues → D1: two rooms plus custom text save/reload/reopen, comma-bearing room label preserved, foreign-school row refused, Venue records/occupancy unchanged, external requests blocked).
- `node tests/v1-product-calendar.mjs` — PASS (unchanged).
- `node tests/v1-product-calendar-pins.mjs` — PASS (unchanged).
- `node tests/v1-product-calendar-publication.mjs` — PASS (unchanged).
- `node tests/v1-product-calendar-provider.mjs` — PASS (unchanged).
- `node tests/v1-product-venues.mjs` — PASS (unchanged).
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): before the fix, the actual local nine-Worker/D1 probe saved one room (HTTP 200), rejected two current school rooms (HTTP 409 `INVALID_VENUE`), and stored only one event. The passing state is re-verified locally above.
- N2 (out of scope, as stated in the task record): B-CA01/H06 generation/week-zero issues, the inherited picker blur/refocus race, archive preview mismatch and F14 legacy jobs transport remain separate. Hosted UAT remains Not tested. F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Owner-authorised v1 changelog work (B03/B-CA02); coordinator-selected bounded repair; exact scope in the task record.
- Q02: Pass. Existing school catalogue and Calendar operation ownership reused; no new data source or access path.
- Q03: Pass. Capability, impersonation, revision and directory-school isolation retained and exercised.
- Q04: Pass. Atomic rejection (no partial writes), idempotent replay, restart recovery and provider-outage behaviour exercised.
- Q05: Pass. Bounded Calendar Worker only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green.
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a reviewed code revert, retaining saved events and operation/audit history.
