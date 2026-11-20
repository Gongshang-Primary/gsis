# Review: PR #239 — Add separate Layout timed-source timetable adoption stream and Roster baseline delivery intent

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `1e0c02a9`.
- Branch: `antigravity/v1-layout-timed-timetable-adoption`. Base: main `7ee24189`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Adds a separate immutable timed-source (aSc timetable) adoption stream in Layout, plus a durable Roster baseline delivery intent, per `docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md`:

- New `v1/services/layout/timed-source.mjs` (445 lines):
  - `POST /internal/adopt-timed-source`: accepts only Roster sources (`sourceDomain === "roster"`), verifies the source operation is committed via Roster `/internal/source-status` (school match, operation match, digest match). Supports inline occupancies and staged projection chunks, each chunk digest-verified; bounds are 10,000 occupancies and 2 MiB per edition. Lessons are sanitized to public fields only (venueId, sourceId, date, start, end, sourceLabel, subject, className, groupName, slotDemand) — private staff phone/email/contact fields never pass through.
  - The edition is written to private R2 with readback digest verification (503 on failure), the head row is stored in `layout_rows` (`table_name='timed_source'`) under a revision guard, and each adopted edition is kept immutably (`timed_source_editions`). Sequence ordering is independent of Deploy's `layout_heads`: the same operation re-adopts idempotently, an older sequence is ignored, never overwriting a newer one. Deploy planning allocations, Layout geometry, and local annotations are untouched.
  - `GET /timetable` (`layout.read`): works with zero Deploy publication; reports `covered: false` outside verified coverage; groups lessons by physical venue (multi-slot venues like ISH-1 appear once with concurrent lessons and preserved raw A/B `sourceLabels`); flags planning-vs-timetable disagreements without refusing sources.
- `v1/services/layout/service.mjs`: `/timetable` added to the read paths, `/internal/adopt-timed-source` wired into `internal()`.
- `v1/services/roster/service.mjs`: `baselineWrite()` queues a durable `roster-layout-timed` outbox delivery intent alongside `roster-venues-complete` (no Deploy prerequisite), and `dispatchRosterJob` delivers it to Layout — `adopted`/`ignored` count as delivered, anything else is retryable.

## Scope, merge, secrets

- Diff vs origin/main: exactly 5 files, matching the task record's exact-file allowlist. 758 insertions, 1 deletion.
- `git merge-tree --write-tree --name-only origin/main 1e0c02a` clean (tree 4d52a978), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- No SQL migrations, no v0.9 source edits.

## CI at the exact head

- Isolated v1 product run 44624750338: **success at head 1e0c02a**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt239-review` at 1e0c02a, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-layout-timed-source.mjs`: exit 0, PASS — separate timed-source adoption, ISH-1A/1B grouping, monotonic ordering, coverage bounds, Roster baseline delivery intent.
- `tests/v1-product-layout.mjs`: exit 0, PASS — existing Layout regressions intact.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, verified committed sources, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
