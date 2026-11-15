# Review of PR #60 — Roster: restore the import job label in System Health

- Reviewer/model: Muse
- Reviewed head: `5dc0f5cb7c0e806d902f2dd50cc7c67431ed1c7e`
- Rebase base: `78f6a214781b66fbaf889b8f2958993bcddd19c6` (current main at rebase time)
- Date (Asia/Singapore): 2026-11-13
- Verdict: **APPROVE**

## What the PR does

Restores the missing `'roster-import':'Roster import'` entry in the `LABELS` map in `roster-update/public/system-health.js`. The shared health job set (`shared/edge-health.js`) already emits `roster-import` jobs, but System Health renders a job row and a recent-failure row only when `Object.hasOwn(LABELS, row.job)` (`system-health.js:40` and `:110`), so without the entry both the current import outcomes and the retained import failures were filtered out of the page. With the entry restored, import jobs and recent import failures render under the "Roster import" label, and unknown jobs stay filtered. Drive and Venues diagnostics are untouched. Product change is one label-map entry; the other files are the CHANGELOG entry and the task record.

## Evidence

- **CI run 43325829756 green at the exact head, all 5 jobs pass** (Regression shards 1–4, full-suite). Verified via `gh pr checks` and `gh run list --branch codex/roster-import-health-label`.
- **Local worktree at the exact head, all 5 health UI tests PASS** (TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM all set to the Playwright chromium-1234 path) — the same five programs the PR body names:
  - `tests/paid097-health-ui.cjs`: PASS — administrator denial, session refresh, no polling, safe rendering, parked retry, manual checkpoint and pause gates.
  - `tests/roster098b-health-ui.cjs`: PASS — read-only status, honest history, processing versus delivery, diagnostic lookup, Received reports guidance.
  - `tests/roster098i-audit-health-ui.cjs`: PASS — visible last export outcome, safe diagnostics, dated pending count.
  - `tests/roster-drive-output-health-ui.cjs`: PASS — ledger, daily/full health and job diagnostics show the provider reason as literal text.
  - `tests/roster-venues-health-ui.cjs`: PASS — alert, Admin confirmation, separate outcomes, no recovery form for ready, unconfigured, SMC or expired access.
- **Label mechanism verified in code**: `shared/edge-health.js:9` lists `'roster-import'` in the emitted `JOBS` set; `system-health.js:40` (jobs table) and `:110` (recent failures) both gate rendering on `Object.hasOwn(LABELS, row.job)`, so the single added entry is exactly what restores both views. No other label was added or changed.
- **Negative control: not applicable.** No new test exists in this PR (confirmed from `gh pr diff 60 --name-only`: no test files changed), so there is nothing to run against base. The five existing health UI tests above are the closest related coverage, and they pass at the head.
- **Canonical build at the head: 18 components, no diff** (`git status` clean after `TZ=Asia/Singapore npm run build`, exit 0).
- **Merge-tree clean**: `git merge-tree --write-tree --name-only origin/main 5dc0f5c` reports no conflicts against current main.
- **Secret scan**: no password/secret/token/key material in the diff. The only grep hit is the pre-existing header comment "browser credentials" (context line, not added content).
- **Scope matches the task record** (`docs/coordination/tasks/roster-import-health-label.md`): hand-written changes are only `roster-update/public/system-health.js`, plus CHANGELOG and the task record. No generated-output changes, no import execution, activation, authority, settings, deployment, live data or notification changes.

## Findings

- **Task record header is stale**: it still says `Status: claimed`, `Reviewer/model: Claude` and `Last updated (Asia/Singapore): 2 November 2026`, while the 13 Nov rebase section and the PR body name Muse as reviewer. Cosmetic only; the record's 13 Nov section is accurate. Worth a one-line tidy when the Status line is updated to approved.
- **Temporary synthetic rendering check not re-run**: the PR body cites a temporary synthetic check for import jobs and retained failures. It is not a committed test, so I did not re-run it; instead I verified the rendering mechanism directly in code (see evidence above). No finding against approval.
- No findings against approval.

## Not tested

Live Google/D1/R2/Drive/Meta/provider behaviour, secret values, deployed authority/configuration, staging/production saves, production browser sessions, or owner rollback. Those are owner verification steps after deployment. The full local suite was not re-run in full here; the five health UI tests plus the canonical build were run at the exact head, and full CI (all 5 jobs) is green at the exact head.

## Release notes

Ships in the next release after v0.9.9v. Deploy the updated Roster Pages `system-health.js` (inside the Roster frontend bundle). No backend, Worker, Google or configuration change. After deployment, System Health shows retained Roster import job outcomes and recent import failures under "Roster import" alongside the existing Drive and Venues diagnostics.
