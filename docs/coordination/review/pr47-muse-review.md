# Review of PR #47 — Cumulative percentage of relief done R% table

- Reviewer/model: Muse
- Reviewed head: `4b6644400a67718d8a4003f079bd48a9c5adc410`
- Base: `codex/roster-relief-count` (PR #46's branch, head `72f14067716b8fbba42bae0ca5fd00869f0f6c86`) — **this PR is STACKED on #46**. It can only merge after #46 merges, and must then be retargeted to main.
- Date (Asia/Singapore): 2026-11-13
- Verdict: **APPROVE**

## What the PR does

Adds the third Statistics table "Cumulative percentage of relief done R%", using the allocator's existing unrounded ranking key (`rankingUtilisation`, exported unchanged from `shared/roster-allocation.js`). The table ranks teachers by cumulative R% done, ascending by default (least done first), with columns Rank, Teacher, Relief done, Committed, R entitlement, R% done, Last relief date, Ranking basis. Confirmed opening balances plus later completed/committed duties count exactly once; last relief date uses only retained records after the opening cutoff; inactive, ineligible, daily-roster and zero-entitlement staff are excluded; Admin/SMC-only Google and D1 reads; sorting, filtering and Excel export stay local. No allocation formula or policy changes.

## Evidence

- **CI run 43319539538 green at the exact head, all 5 jobs pass** (Regression shards 1–4, full-suite). Verified via `gh pr checks 47`.
- **Local worktree at the exact head, all 10 programs PASS** (TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM all set to the Playwright chromium-1234 path) — the 4 changed/new tests from the diff plus the 6 related programs the PR body lists:
  - `tests/roster-statistics-r-percent.cjs` (new): PASS — year-to-date fairness projection: existing allocator key, current SRE basis, committed reservations, exclusions, exact ties, names, last date, read-only Google authority.
  - `tests/roster-statistics-r-percent.mjs` (new): PASS — real D1 R% route: saved records, published completion, existing fairness key, no Google calls, no writes and current Admin/SMC gate.
  - `tests/roster-statistics-r-percent-ui.cjs` (new): PASS — third R% table: exact title, annual window, ascending default, local column sorting/filtering and explicit committed-work note.
  - `tests/roster087-statistics-ui.cjs` (changed): PASS — Chromium Statistics: now 8 tables/exports (was 7), gzip hydration, restricted access, typed Excel dates/numbers, local filtering/sorting/chart drilldown, completed mode, conditional refresh, calendar presets, multi-year chunks, mobile bounds, compact width, stale response isolation.
  - `tests/roster-relief-count.mjs` (parent #46 program): PASS — real D1 calculations.
  - `tests/roster-relief-count-ui.cjs` (parent #46 program): PASS — quota-zero wording preserves completed count.
  - `tests/roster-fresh-start-accounting.cjs`: PASS — archive proposal cutoff separation, distinct staff identities.
  - `tests/roster088-statistics-contrast.cjs`: PASS — header/filter contrast above 4.5:1.
  - `tests/roster-d1-parity-guard.cjs`: PASS — parity inventory coverage: 273 operations/views/routes/writers.
  - `tests/roster-d1-parity.mjs`: PASS — 273 operations, 86 successful, 57 missing, all network calls intercepted.
- **Negative control reproduced**: all three new test files FAIL on #46's head (72f1406), exit 1:
  - `tests/roster-statistics-r-percent.cjs`: `TypeError: S.fairness is not a function`.
  - `tests/roster-statistics-r-percent.mjs`: `Error: A stable save request ID is required.` (400 / ROSTER_REQUEST_ID) — the `statisticsRPercent` operation does not exist on #46's head, so the D1 dispatch falls through to a save path. Indirect failure mode, but the test still detects the missing feature.
  - `tests/roster-statistics-r-percent-ui.cjs`: `AssertionError` strictEqual (third table absent).
- **Canonical build at the head: 18 components, no diff** (`git status` clean after `TZ=Asia/Singapore npm run build`).
- **Merge-tree clean against #46's head**: `git merge-tree --write-tree --name-only 72f1406 4b66444` reports no conflicts. (Not against main — #47 is stacked; a merge-tree against main is not applicable until it is retargeted.)
- **D1 parity**: the inventory now has 273 entries (was 272); the new `statisticsRPercent` row is "works (200)" with a successful synthetic D1 probe, and all 272 previous outcomes are unchanged.
- **Secret scan**: no password/secret/token/key material in the diff. The only matches are pre-existing `dayToken` / `rosterOperationsAttachDayToken_` references and parity-doc line numbers.
- **Scope matches the task record** (`docs/coordination/tasks/roster-statistics-next-in-line.md`): hand-written changes are the `fairness` read projection in `shared/roster-statistics.js` / `roster-update/public/roster-statistics.js`, the `statisticsRPercent` dispatch in `backend/RosterStatistics.gs` + `backend/RosterOperations.gs` + `backend/Code.gs`, the D1 route in `roster-update/public/edge-roster.js`, the third table in `roster-update/public/roster-statistics-ui.js`, the one-line `rankingUtilisation` export in `shared/roster-allocation.js` and `roster-update/public/edge-roster-domain.js`, plus tests, the parity inventory and the task record; the rest are canonical generated bundles. No allocation formula, ranking, workload, quota, publication, WhatsApp, live data, settings or release-branch changes.

## Findings

- **`rankingUtilisation` is exported, not copied**: `shared/roster-allocation.js` changes by exactly 2 lines (the export list gains `rankingUtilisation`); the function itself is untouched. The table therefore uses the allocator's own key, as the task record requires.
- **Read-only and Admin/SMC-only on both paths**: the Google handler (`rosterStatisticsRPercent_`) and the D1 handler both fail 403 for non-SMC/non-Admin, and the projection performs no writes (the D1 test asserts state is unchanged after the call).
- **Opening balances counted once**: the projection skips records on or before an opening balance's `asOfDate` and starts the window at the fresh-start effective date when it falls in the current year; the last-relief-date loop uses retained records only. Covered by the new tests.
- **Task record header still names Claude as reviewer**, but the rebase note in the same record and the PR body name Muse, which matches current governance (coordinator returned to Muse 13 Nov; Muse reviews Codex PRs). Record-only; no code impact.
- No findings against approval.

## Not tested

Live Google/D1/R2/Drive/Meta/provider behaviour, secret values, deployed authority/configuration, staging/production saves, production browser sessions, or owner rollback. Those are owner verification steps after deployment. The full local suite was not re-run in full here; the 10 affected/related programs plus the parity checks and canonical build were run at the exact head, and full CI (all 5 jobs) is green at the exact head.

## Release notes

Ships in the next release after #46 merges and this PR is retargeted to main. Deploy updated Roster Pages (`roster-statistics.js`, `roster-statistics-ui.js`), the generated `edge-roster.js` / `edge-roster-domain.js`, and the canonical Notification/Operations Worker bundles. Google stays frozen. Refresh an open Statistics page after deployment.
