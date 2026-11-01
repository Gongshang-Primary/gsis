# roster-d1-cutover-attempt3: blockers for the Mon 2 Nov 22:00 retry (Codex, workday queue)

- Status: authorised (owner 2 Nov 05:22: "line up important PRs for codex ... reattempt D1 cutover tonight 10 pm")
- Owner/model: Codex (build), Claude (review, runbook)
- Lane: R (serial; owner exception for cutover blockers; other lane R PRs #38, #40-#48 stay held)
- Deadline: PRs reviewed and merged by 17:00; bundle v0.9.9h by 18:00; owner deploys by 21:00.

## What happened (attempt 2, 1-2 Nov)
Import a90c68d1 and parity passed; activation at 04:41 matched exactly (lease-order fix). Then:
1. Every D1 read failed with `ROSTER_AUTHORITY_STALE` after 15 minutes: no scheduled Contacts refresh. Fixed live (PR #50).
2. Assign Relief / allocation failed with "Published Deploy authority is not active": D1 Roster reads Deploy's published reference from D1's `deploy` scope, which is still legacy. Not fixable live.
3. Google backup copies the full 13,561 items per generation and stalled at 465; "Update backup" on Pages ran out of memory and held a 7-minute lease.
4. Emergency rollback 05:15-05:19: Cloudflare `ROSTER_EDGE_AUTHORITY=legacy` (3 places) and Apps Script property deleted with `edgeAuthorityRollbackToLegacy()`. D1 heads stay `active` (revision ~18), unused.

## Queue, in order (one PR each, draft, CI green, Claude reviews exact head)
### R1 (P0): reset D1 after an emergency rollback
`restart` refuses an `active` head ("An active, paused or changed authority cannot be reset"), so no new import is possible. Add an Admin operation in edge-setup ("Reset D1 after manual rollback") that proceeds only when Google proves the fence is lifted (`edgeFenceStatus.legacyWritesDisabled===false`) and Cloudflare authority is legacy, then retains evidence, sets both Roster heads to `legacy`, clears the mirror generation/outbox, and leaves an audit row. Tests: refuses while fenced; refuses with d1 env; succeeds and a new import can start.

### R2 (P0): Roster on D1 reads published Deploy from Google while Deploy stays on Google
In `roster-update/public/edge-deploy.js` `edgeDeployRosterReference`, when the D1 `deploy` scope is not active, fetch the immutable published Deploy document and entry from Google (signed service call; find the existing Deploy publication export, e.g. `backend/DeployEdge.gs`) and run the **same** `createDeployDomain(...).rosterReference(document, entry)`. Same code, different source: shapes cannot drift. Cache by publication commit/revision in D1 so reads do not call Google every request; refresh when Deploy publishes. Tests: quota parity, D1 path versus Google path, on a fixture publication; failure stays a clear error, never empty quotas for allocation (`edgeRosterNeedsQuota`).
Not needed: moving Deploy, Calendar, Contacts or Venues to D1. They stay Google sources through signed adapters.

### R3 (P1): Google backup that finishes
(a) Pages `mirror` (Update backup) must not run the mirror in the website request: enqueue/trigger the Worker run and return status (no 128 MB crash, no stolen lease). (b) Speed: raise per-run budget/steps in the Worker, and make later generations incremental (only records changed since the last mirrored revision) or prove a full copy completes within 30 minutes on 13.5k items. Tests for both. Switch-back depends on this.

### R4 (P1): post-activation smoke test
A test harness that activates D1 on a realistic fixture and then runs, at t+0 and t+20 minutes (fake clock): profile, Assign Relief read, calculations, statistics, saveAbsence, auto-allocate. This is the test that would have caught faults 1 and 2.

### R5: review Claude's hotfix PRs #49 (lease order, tolerance, drift during freeze) and #50 (references refresh, raw error log)
Advisory review; owner merges.

### R6: peer-mail health only, split from #41 (owner handed to Codex 2 Nov ~05:35)
New PR from main with only the peer-mail health commits of #41 (521dede, 9099f2e, dbef7ec and the idle/lock changes), without #38 inactive-staff or #40 weekly-R/FAJT. Answer Claude's open question with a test (where peer-mail health writes under D1 authority; the fence must never cause a repeating failure or a resend). Keep #41 open. Target merged by 17:00 for tonight's bundle.

## Not in scope today
Drift-check import stall (logged in roster-cutover-diagnostics.md), #38/#40-#48 (held).
