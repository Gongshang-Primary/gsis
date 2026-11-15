# Review of PR #42 — Roster: report fixed work-item totals during import preparation

- Reviewer/model: Muse
- Reviewed head: `c5a59758e47ee37b30085a409b4f0de0ddd2e27a`
- Base (merge-base): `a03a3323570922fa642df84f2b04d28e0de39eb4`
- Date (Asia/Singapore): 2026-11-13
- Verdict: **APPROVE**

## What the PR does

Import preparation now reports a fixed work-item total and completed count separately from the poll/step ordinal. The Google export reply (`backend/RosterEdgeMigration.gs`) adds `progressUnit:'work-items'`, `workDone` (1 + completed job index + 1 at finalize + 1 at ready) and `workTotal` (jobs + 3: frozen source, each captured object, the complete record set, the verified manifest). The legacy `step`/`done`/`total` formulas and checkpoint ordinals are unchanged, so older readers and Workers keep working. The D1 import path (`shared/roster-import.js`) validates the new fields (400 on an invalid unit or counts) and passes them through in preparing/failed status; the setup UI (`shared/edge-setup.js` and its public/roster-update copies) renders "N of M work items complete · P parts saved" when the explicit unit is present, falls back to the legacy step display otherwise, and refuses invalid unit/count combinations. Progress and failure messages use the same projection.

## Evidence

- **CI run 43316032191 green at the exact head, all 5 jobs pass** (Regression shards 1–4, full-suite). Verified via `gh pr checks`.
- **Local worktree at the exact head, all 9 programs PASS** (TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM all set to the Playwright chromium-1234 path):
  - `tests/roster099-import-progress.cjs` (new): PASS — truthful preparation totals: fixed inventory, partial object/record uploads, independent ordinals, zero objects and ready manifest.
  - `tests/edge094-setup.cjs` (changed): PASS — operator setup: denied access, stable retry, private export, reviewed activation, endpoint selection and mirrors.
  - `tests/roster-import-setup-progress.cjs` (changed): PASS — setup build label, restored preparation ordinal and live freeze age.
  - `tests/roster099-packed-capture.cjs` (changed): PASS — packed production-shaped capture, 10 plans, 9 archives, 150 teachers, 0 capture decodes (simulated).
  - `tests/roster099-preparation-control.cjs` (changed): PASS — preparation control: exclusive seven-minute lease, ordinal CAS, replay, timeout takeover, lost acknowledgment, retained restart, cleanup admission and ready handoff.
  - `tests/roster099-chunked-import.cjs`: PASS — immutable 14MB+ freeze, UTF-8 lengths, global IDs, duplicate rejection and large segmented gzip object parity.
  - `tests/roster-import-server-continuation.mjs`: PASS — actual Pages start and isolated Queue hook and server-only completion.
  - `tests/roster-d1-parity-guard.cjs`: PASS — parity inventory coverage: 272 operations/views/routes/writers.
  - `tests/roster-d1-parity.mjs`: exit 0 — 272 operations, unchanged.
- **Negative control reproduced**: the new test `tests/roster099-import-progress.cjs` on origin/main (78f6a21) FAILS, exit 1, `AssertionError: source with no objects` — `progressUnit` is `undefined` instead of `'work-items'` at line 30. The test detects the change.
- **Canonical build at the head: 18 components, no diff** (`git status` clean after `TZ=Asia/Singapore npm run build`).
- **Merge-tree clean**: `git merge-tree --write-tree --name-only origin/main c5a5975` reports no conflicts (single tree SHA).
- **Copies verified**: `shared/edge-setup.js` is byte-identical to both `public/edge-setup.js` and `roster-update/public/edge-setup.js`; the edge-store copies carry the same workDone/workTotal validation as `shared/roster-import.js`.
- **Secret scan**: no password/secret/token/key material in the added diff lines.
- **Scope matches the task record** (`docs/coordination/tasks/roster-d1-import-progress-total.md`): hand-written changes are only `shared/roster-import.js`, `shared/edge-setup.js`, `backend/RosterEdgeMigration.gs` and their public/roster-update copies, plus tests, the new legacy-preparation fixture and the task record; the rest are canonical generated backends and Worker bundles. No import behaviour, source/checkpoint bytes, identities, digests, transfer chunks, limits, timing budgets, live data, flags or deployment changes.

## Findings

- **workDone/workTotal arithmetic is consistent**: at `ready`, workDone = 1 + jobs + 1 + 1 = jobs + 3 = workTotal, so the count completes exactly at the manifest. At `finalize` it is jobs + 2, one short of the total until the manifest is verified. Correct.
- **Legacy counters are untouched**: `step`, `done` and `total` keep their original formulas in the export reply, and the UI falls back to the legacy step display when `progressUnit` is absent, so older UI and older Workers continue the same import. Correct.
- **Invalid metadata is refused, not rendered**: the UI throws "Preparation progress was not verified" when the unit is present but counts are missing or out of range, and the D1 validator returns 400. Correct.
- **Observation, not a blocker**: the PR has no CHANGELOG.md entry. The change is reporting-only and the task record is the record; adding one is optional and not required for approval.
- No findings against approval.

## Not tested

Live Google/D1/R2/Drive/Meta/provider behaviour, secret values, deployed authority/configuration, staging/production saves, production browser sessions, or owner rollback. Those are owner verification steps after deployment. The full local suite was not re-run in full here; the nine affected/current programs plus the parity guard and canonical build were run at the exact head, and full CI (all 5 jobs) is green at the exact head.

## Release notes

Ships in the next release after v0.9.9v. Deploy the updated Roster backend (`RosterEdgeMigration.gs` via the canonical generated `Roster_Backend_v0.9.9.gs`), the canonical Notification/Operations Worker bundles, and the updated Roster Pages edge-setup/edge-store copies. No live configuration, authority, migration or template change.
