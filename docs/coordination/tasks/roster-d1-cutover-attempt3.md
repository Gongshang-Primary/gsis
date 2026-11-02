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

## Reprioritised order (owner 2 Nov ~05:45)
R0 (first hour, report by 10:00) → R1 → (R2-alt Deploy-first, or R2) → R6 → R7 → R3 → R4 → R5.

### R0: Deploy-on-D1 readiness check (report, no product change; by 10:00)
Assess moving Deploy to D1 first (it would satisfy Roster's designed path: `edgeDeployRosterReference` reads an active D1 `deploy` scope). Report in this record: (a) the Deploy import/activate/fence/pause/resume flow in `edge-deploy.js` `edgeDeployAdmin` and `public/edge-setup.js`, with test coverage; (b) the rollback path: is there a verified Google backup or switch-back for Deploy, and what happens to Deploy edits after activation; (c) every reader of Deploy from Google while Roster stays on Google (Roster Apps Script, Contacts, Calendar, LORD, Venues) and what freezes; (d) estimated import time; (e) gaps to close today. Verdict: Deploy-first (R2-alt) or R2.

### R2-alt (if R0 says ready): Deploy cutover runbook support
Close only the gaps R0 lists so Deploy can cut over at ~21:00 tonight, before Roster at 22:00. Roster's D1 path then reads the active D1 Deploy scope with no new adapter.

### R7: server-driven import continuation and parallel staging
A Worker (cron or queue) advances preparation and staging without the browser tab; staging commits 2-4 parts concurrently. The page only shows progress. Tests: import completes with no page polling; a stalled page never stalls the import.

## Queue detail (one PR each, draft, CI green, Claude reviews exact head)
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

## R0 assessment, 2 November 2026, Model: Codex

Assessed product source at main `db673bb357d4d87ee2f6f9da840c2acadacdf3b6`. This is a source review and synthetic verification, not a live readiness or timing claim. No production setting, source record or message changed.

### (a) Deploy ownership flow and coverage

`public/edge-deploy.js:180`, `edgeDeployAdmin`, requires a fresh Contacts-verified Deploy Admin. Import calls the signed Google `deployEdge/export` adapter, normalises all draft/publication fields, receipts and properties, and imports the `deploy` scope through `GSiSEdgeStore.importState`. It is a single source-export call, not Roster's resumable capture. The same request ID replays its import receipt.

Activation requires an imported head. The Google `backend/DeployEdge.gs` fence acquires the Script lock, verifies the unchanged source index revision, requires the Worker service URL/secret, and writes `DEPLOY_EDGE_MODE=fenced` with source evidence. Only after that signed proof does the Worker transition imported to active. Operator routing to D1 is separate. A failed second stage may leave Google fenced while D1 remains imported and requires recovery; there is no automatic unfence.

Pause transitions active to paused in D1; it leaves the Google fence intact. Resume calls the signed fence adapter again and then transitions paused to active. Neither action restores a Google writer. Export downloads the current D1 state/digest; it does not write that state back to Google. The setup page offers status/import/export, explicit export-review confirmation before activation, pause/resume and retained handoff retry.

Coverage: `tests/deploy094-edge.mjs` passes the canonical D1 domain, publication isolation, receipts, signed-service refusal, Contacts caching and ordered handoff cases. Its initial import/activation calls the generic Store directly. `tests/edge094-store.cjs` covers atomic store import, transitions, pause/resume proof and reset refusal for active/paused stores. `tests/edge094-setup.cjs` covers operator control gates and confirmation. Search found no direct test of the complete `edgeDeployAdmin` Google export-to-fence-to-activation/resume flow. Do not treat domain coverage as that end-to-end rehearsal.

### (b) Rollback and edits after activation

No Deploy equivalent of the Roster mirror, caught-up proof or verified Google switch-back exists. `shared/roster-mirror.js` mirrors only `roster` and `roster-register`; Deploy admin has no release or reverse-import operation. After activation, planning edits, publications and receipts commit in D1. The Google Deploy workbook remains at its cutover version. Contacts/Layout handoff jobs publish derived catalogues; they are not a complete Deploy backup.

A frontend rollback or deleting the Google fence would therefore expose stale Google data and can lose post-cutover edits or create two writers. A private D1 export preserves evidence, but no reviewed native Google restore consumes it. Pausing D1 is a safe stop, not a switch-back. This is a blocking recovery gap for Deploy-first tonight.

### (c) Readers while Roster stays on Google

| Consumer | Current path and effect of a Deploy-only cutover |
| --- | --- |
| Roster Apps Script | `backend/RosterOperations.gs:128` opens the Deploy Google book, selects its published entry and calculates quota/reference data directly. Its own script does not inherit Deploy's per-project fence or forward this read. New D1 Deploy publications would leave Google Roster using the old workbook's R, classes, groups and venues. Personal/statistical calculations using that book have the same exposure. |
| Contacts | `backend/Contacts_Code_with_Deploy_API.gs:398` first uses its retained deployment projection; the optional fallback signs `action:active` to the Google Deploy URL. Fenced Deploy forwards `active` to D1. Published membership/options arrive through ordered Contacts handoff jobs. Staff editing stays on Google; delayed/failed handoffs can leave its derived catalogue behind. |
| LORD | `lord-suite/Source/backend/Code.gs:7165` reads a signed Deploy source through `LORD_DEPLOY_APPS_SCRIPT_URL`. `backend/LordDeploy.gs:13` forwards it to the Worker when fenced. It should follow D1 once the service bridge and live physical registry work; source failure retains/flags the last verified LORD snapshot rather than verifying a new one. |
| Venues | `venues-backend/Sources.gs:8` supports a configured Worker source URL or its Google Deploy URL. `backend/DeployVenues.gs:19` forwards the signed Google source when fenced. Refresh depends on an active, reachable D1 Deploy service and matching publication identity. An unavailable source prevents a new verified occupancy projection. |
| Calendar | No direct Deploy workbook reader was found in the canonical Calendar backend. `calendar-backend/VenueDirectory.gs:3` reads the signed Venues catalogue; its booking/event source remains Google. A Venues lookup failure affects the optional directory, with free-text location retained, rather than freezing Calendar saves. Calendar's date service remains an input to other products. |
| Layout and public campus | Deploy publication queues a versioned Layout handoff; `backend/DeployEdge.gs` applies it through the existing Google adapter. Contacts and Layout jobs are ordered and retried. Direct Google Deploy `publicCampus` is forwarded when fenced. Failures can leave the last published Layout/campus projection behind; no complete Google Deploy state is restored. |

Only Deploy business writes are fenced. Other products' Google writers do not automatically freeze. The critical incompatible reader is Google Roster's direct Deploy-book access during the proposed 21:00-to-22:00 interval and any Roster rollback afterward.

### (d) Import-time estimate

A small register should take seconds to a few minutes plus operator comparison, but there is no measured production-sized Deploy import in the available evidence. This is an estimate, not a verified service bound. The signed adapter has a 25-second response timeout. Export enumerates every draft, retained publication and saved receipt in one Apps Script call, then D1 performs one logical whole-state import. Large history can exceed that request window; there is no resumable Deploy preparation or captured progress total. Source revision changes also force a fresh import before activation. A reliable tonight estimate requires a read-only sized export and a timed rehearsal, neither performed here.

### (e) Gaps and today's bounded path

Deploy-first needs a verified native Google backup/reverse cutover for all post-activation edits and receipts, a fix or deliberate fence for Google Roster's direct Deploy-book readers, and the full Admin migration/recovery/service-bridge rehearsal on a representative source. These are additional product work, not a runbook-only gap.

Use R1 plus R2 for tonight's go/no-go. Keep Deploy, Contacts, Calendar and Venues on their current Google sources. R2 supplies the immutable published Deploy document to D1 Roster through the existing signed Roster service, runs the existing `rosterReference` calculator, and caches the verified publication identity. Then take R6 and R7 in the revised owner order. R3-R5 remain conditional on time. Owner still decides merge and deployment.

**Verdict: R2. Do not cut over Deploy first tonight.**
