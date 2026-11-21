# Review: PR #243 — Implement Calendar two-step bulk event import (T03)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `259dfbd3`.
- Branch: `antigravity/v1-calendar-bulk-import`. Base: main `51dbdc7`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Implements Calendar two-step bulk event import (T03) in new `v1/services/calendar/bulk-import.mjs`, wired into `v1/services/calendar/service.mjs`:

- **`importEventsPreview`** (`calendar.admin`, read): validates school scope (403 on mismatch), year bounds (2000–2200), active non-archived school year (409 otherwise), batch ceilings (≤ 500 rows, ≤ 512 KiB canonical payload, school event bound 5000), and per-row event validity via Calendar's `validateEvent`. Optional multi-room `VenueID` is checked against the Venues `/internal/catalogue` (at most six distinct current venues). Returns structured per-row errors or a deterministic `previewDigest` bound to the current `calendar_years.revision`. Zero database writes.
- **`importEventsApply`** (`calendar.admin`, write): requires a 64-hex `previewDigest`, re-validates, checks the year revision CAS (`409 REVISION_CONFLICT` when `expectedYearRevision` differs or the digest no longer matches, compared with `secureEqual`), replays idempotently by `operationId` (deterministic `bulk-<digest>` event IDs), atomically inserts all validated events in one D1 transaction via `commitOperation`, increments `calendar_years.revision`, and queues existing Calendar sync outbox intents (no live sends while disabled).

## Scope, merge, secrets

- Diff vs the PR base: exactly 4 files, matching the task record's exact-file allowlist (task record, new `bulk-import.mjs`, `service.mjs`, new test). 528 insertions, 2 deletions.
- `git merge-tree --write-tree --name-only origin/main 259dfbd3` clean (tree 2945b2f7), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).

## CI at the exact head

- Isolated v1 product run 44655996153: **success at head 259dfbd**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these six PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt243-review` at 259dfbd3, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-calendar-bulk-import.mjs`: exit 0, PASS — preview validation, multi-room venue verification, bounds/auth/archived-year denial, atomic commit, idempotent replay, and CAS revision conflict.
- `tests/v1-product-calendar.mjs`: exit 0, PASS.
- `tests/v1-product-calendar-tables.mjs`: exit 0, PASS.
- `tests/v1-product-calendar-venues.mjs`: exit 0, PASS.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, fail-closed validation with digest + revision CAS, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
