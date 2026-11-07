# Review: PR #96 — D1 intake review, duplicate recovery and overlap decisions

- Reviewer/model: Muse
- Reviewed head: `c4f1e0bb90b960d64ccac6421962e3640f91244a`
- Branch: `codex/roster-intake-overlap-message`
- Task: `docs/coordination/tasks/roster-intake-overlap-message.md`
- Verdict: **approve** at the exact head above. The owner merges.

## Evidence

- CI at the exact head: run 42170405625, all 5 jobs success (full-suite plus Regression shards 1–4), verified through the check-runs API on the head commit.
- Local, worktree at the exact head, `TZ=Asia/Singapore NODE_NO_WARNINGS=1`, Chromium `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`:
  - `tests/roster093b-absence-intake.cjs` — PASS (exit 0).
  - `tests/roster099n-intake-overlap-ui.cjs` — PASS (exit 0).
  - `tests/roster099n-intake-overlap.mjs` — PASS (exit 0).
  - `TZ=Asia/Singapore npm run build` — PASS, `git status` clean (no generated diff).
- Merge: `git merge-tree --write-tree --name-only origin/main HEAD` clean (tree `a09b41540352bf7ce80309a5f714da6b1778aafe`); GitHub reports MERGEABLE / mergeStateStatus CLEAN at review time. Main at review time: `7c73a8a`.
- Diff read in full (23 files, +4499/−1703). The bulk is the two regenerated Worker bundles (`notification-worker/dashboard-worker.*`, `operations-worker/dashboard-worker.*`); the hand-written change is small and the build-no-diff check covers the generated copies.

## Scope — matches the task file (items 0–5)

- 0. `intakeReview` on D1 exists and uses the new shared read-only projection `GSISRosterOperations.intakeReviewProjection` (requested coverage, type, reason, relief flag; per teacher and date the saved entries and missing dates). The Google backend (`backend/RosterAbsenceIntake.gs`) now calls the same shared projection instead of its inline copy, so Google/D1 parity is structural, not a second implementation. The projection never applies, retries, withdraws or clears a pending gate.
- 1. The overlap 409 now carries code `ABSENCE_OVERLAP`, and the review lists the overlapping saved entries with a plain message: "You already have an absence for P<n> on <date> (<type>: <reason>). SMC will review." The intake list also attaches that message and failure code to parked transport entries.
- 2. Exact duplicates auto-resolve as "Already recorded" with an `absence-already-recorded` essential audit event, only when `ctx.intakeDeduplicate` is true — which the edge route sets only for trusted intake (`p.intake===true` with `trustedIntakeAt`). Ordinary saves cannot trigger it. The match requires one overlapping record with the same type, reason, relief flag and intervals. A bounded recovery scan (`dueAbsenceOverlapRecords`, LIMIT 4, needsReview + `BACKEND_REJECTED_409`, ordered by `available_at`) resolves retained duplicates the same way; a partial overlap fails the duplicate check and is deferred for one hour.
- 3. SMC review offers Merge into existing, Keep existing, or Edit existing then retry. Merge goes through the resubmission path with the incoming type/reason/relief setting; past-date merges are refused (403 `ROSTER_INTAKE_PAST`); Keep closes the report with an `absence-intake-keep` audit and no absence change; Edit navigates to Manage reported absences and the retained report is retried afterwards. Every decision needs a reason (1–1000 chars) and a confirm checkbox.
- 4. The reporter's card shows the true transport state: `needsReview` maps to a needs-review card (never "sending" for a parked report), `alreadyRecorded` shows "Already recorded. Your existing absence is unchanged.", and `SMC_KEEP_EXISTING` shows "Existing absence kept; report closed by SMC."
- 5. Tests cover duplicate auto-resolution, partial-overlap reason and options, and card state matching transport state (the three changed test files, all passing locally; the full suite passed in CI at this head).

## Live safety

- The review projection is read-only. Reporting/derived code cannot fail a D1 save: the recovery path catches storage errors and returns `{available:false, code}` diagnostics, and fresh captures drain before the retained-duplicate scan, so a recovery outage cannot block new attendance.
- The decision commit is atomic: the D1 batch updates the roster head only if the transport row still matches (namespace, actor, request id, digest, attempts, state `needsReview`), and the transport state change carries the same guard plus the write-token guard. Attendance, audit, decision receipt and transport resolution commit together or not at all.
- The review token binds the decision to the register revision and the full absences, assignments and requests arrays; any change forces a fresh review (409 `ROSTER_INTAKE_REVIEW_CHANGED`). Concurrent retry/withdrawal is caught by the same state/attempts check.
- Manual, peer, protected, Stapler-imported, published and started relief are not moved by this change: merge uses the existing resubmission path, the task file records protected published relief as preserved, and the duplicate path skips absence alerts and day bumps for unchanged ids. No Stapler code is touched; the latest confirmed Stapler version remains the timetable.
- No schema migration, no live repair, no settings, sends, deployment or authority change. No secrets, tokens, private links or private school records in the diff. The internal `readAbsenceTransportRecord` (with `all:true`) is called only after an SMC/Admin check in both review and resolve paths, and only the sanitised public receipt reaches the browser.

## Live data note

The two rows cited in the task file behave as specified: `db77bad5…` (exact duplicate of the saved 18 Nov P5–P6 "WR" absences) will auto-resolve as Already recorded on the next recovery wake after deploy, with no SMC action; `9b500d10…` (partial overlap on 10 Nov P10) stays parked for SMC review. Both outcomes are what the task requires.

## Findings

- None blocking.
- Nonblocking note: the review token hashes the full absences, assignments and requests arrays, so any saved change anywhere in the register invalidates an open review and forces a fresh one. That is safe and correct; it may ask SMC to re-open a review if another absence is saved in between.
- Not independently verified: the PR body's "All 962 present tracked files match the uploaded source and generated blob SHAs" count. The canonical build with no diff at this head covers generated-output consistency, which is the review gate.

## Release notes for the owner

D1 received absence reports now open a Review report that shows saved overlapping periods and reasons. Exact duplicates are marked Already recorded with an audit note, including bounded recovery of retained duplicate refusals. SMC can merge, keep existing, or edit then retry, with each decision bound to a current review and committed atomically with the report status. Reporter cards show parked, Already recorded and applied states accurately. No new setting, authority switch or live repair; revert this change to roll back.
