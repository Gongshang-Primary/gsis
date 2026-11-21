# Review: PR #253 — Roster: Calendar-backed statisticsCalendar presets & Ad Hoc Relief mobile update (CI01, C12–C14)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `3820e96`.
- Branch: `antigravity/v1-roster-statistics-and-adhoc-mobile`. Base: main `6461f4e`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Two features, both fail-closed:

1. **Calendar-backed `statisticsCalendar` presets (CI01)**:
   - New Calendar `/internal/year-structure`: school check (403 on mismatch), decision inspection (`roster.read`/`roster.write`/`roster.admin`, `calendar.read`/`calendar.admin`), year bounds (2000–2099). Derives Term (`T1`–`T4`) and Semester (`S1`, `S2`) ranges from authoritative `calendar_metadata` `yearStructure` (`TERM_WEEK`) records, merging overlapping ranges by earliest start / latest end; a semester is returned only when both constituent terms exist. When no structure exists it returns empty terms/semesters with an explicit "unavailable; use an explicit date range" basis — no dates are guessed.
   - Roster `statisticsCalendar` now calls Calendar `/internal/year-structure` when the `CALENDAR` binding exists and returns `{ year, terms, semesters, basis, semesterBasis, revision }`, compatible with `GSISRosterStatistics.preset('term' | 'semester')`. Without the binding it returns the same shape with empty terms/semesters and the unavailable basis.
2. **Roster Ad Hoc Relief mobile update (C12–C14)**:
   - New `updateRosterContactMobile` (`adHocUpdateMobile`, and `contactCreate` with `existingStaffId`): requires a valid operation ID and an existing staff ID, enforces the mandatory 8-digit Singapore mobile gate (`^[89]\d{7}$`), requires the teacher to exist in the Contacts projection (404), rejects a mobile already assigned to another staff member (`409 DUPLICATE_MOBILE`), and delegates the write to Contacts `/internal/update-mobile` with an optional prior field revision. `Basic Name` and `TTb Name` are read from the projection and preserved, never written.
   - Contacts `/internal/update-mobile` now omits an `undefined` `mobile` revision from `fieldRevisions`, so `canonical(intent)` succeeds when Roster supplies no prior field revision.

## Scope, merge, secrets

- Diff vs the PR base: exactly 6 files, matching the task record's exact-file allowlist (task record, `v1/services/calendar/service.mjs`, `v1/services/contacts/service.mjs`, `v1/services/roster/service.mjs`, `v1/services/roster/contact-create.mjs`, new test). 434 insertions, 17 deletions.
- `git merge-tree --write-tree --name-only origin/main 3820e96` clean (tree d0c7c230), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).

## CI at the exact head

- Isolated v1 product run 44859927498: **success at head 3820e96**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these six PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt253-review` at 3820e96, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-roster-statistics-and-adhoc-mobile.mjs`: exit 0, PASS — `statisticsCalendar` returns empty terms/semesters without guessing when Calendar yearStructure is absent; derives authoritative Term (T1–T4) and Semester (S1, S2) presets from Calendar yearStructure; `adHocUpdateMobile` enforces the mandatory mobile gate, rejects duplicates/unauthorized callers, writes back to Contacts read-only-preserving Basic/TTb Name, and replays idempotently.
- `tests/v1-product-roster-service.mjs`: exit 0, PASS.
- `tests/v1-product-calendar.mjs`: exit 0, PASS.
- `tests/v1-product-operation-probe.mjs`: exit 0, PASS — 399 probes, **`knownMissing` 0** (all 24 probe allowances now cleared), parsedScripts 131.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, fail-closed presets and mobile gate with duplicate rejection, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
