# roster-d1-cutover-freeze: freeze Google writers before the cutover snapshot, so activation cannot miss

- Status: implementing, top priority. Owner assigned all open work to Codex on 1 November 2026.
- Owner/model: Codex (builder)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 1 Nov 2026 04:05
- Branch: codex/roster-d1-cutover-freeze
- Base SHA: 0627ba5613cf04badfc89156f34d32ba24a0c14a
- PR: none
- Lane: R (Roster core and D1), serial.

## Problem (evidence)
- Activation's fence (`edgeFence`, backend/RosterEdgeMigration.gs ~line 33) refuses unless `p.sourceDigest === rosterEdgeSnapshot_().sourceDigest`, i.e. Google is byte-identical to the import's capture.
- A real import takes well over an hour: rehearsal 3 (request f5f336a2…, v0.9.9e) needed 112 preparation steps before staging into D1.
- Background writers keep changing Google during that hour even on a quiet weekend: Worker crons (notifications claim, peer-mail, scheduled allocation every ~30 min, inbox, audit export), the nightly cold archive (16:00 to 24:00), and Apps Script maintenance. Any write changes the snapshot digest, so a fresh import is very likely stale by activation.

## Required
1. **Cutover freeze (Admin, edge-setup):** a new action "Freeze Google for cutover" that, under the Roster script lock:
   - sets a Script Property `ROSTER_CUTOVER_FREEZE` with actor, time and request ID;
   - makes every Google Roster writer refuse with a clear 423/503 "Roster is being moved; try again shortly" (user saves, intake processing, scheduled allocation, notification transport writes, archive, maintenance), without dropping queued Worker-side work (absence transport stays queued in D1 and is replayed later);
   - Worker background jobs see the freeze (via a cheap status call or a D1 flag) and skip Google writes, recording "skipped: cutover freeze" in job health.
2. **Import after freeze:** capture is allowed while frozen (it is a read), and the freeze guarantees the digest stays put until activation.
3. **Activation:** if frozen, activation proceeds as today (fence plus D1 active) and clears the freeze; the queued Worker work then drains to D1.
4. **Unfreeze without activating:** "Cancel freeze" returns Google to normal (for an aborted cutover), with audit.
5. **Timeout guard:** the freeze shows its age on edge-setup and in System Health; after 4 hours it raises an Admin alert (it does not auto-release).
6. Runbook update: `docs/v099/ROSTER_D1_CUTOVER.md` step 1 becomes "Freeze, then import".

## Acceptance
- With the freeze on: a simulated user save, intake run, scheduled allocation, notification claim and archive run each refuse or skip; the snapshot digest is unchanged across them.
- Queued absence transport is not lost; after activation it is applied to D1 exactly once.
- Cancel freeze restores normal writes.
- Activation after a frozen import succeeds; activation after an unfrozen, changed source still refuses (existing safety).
- Full suite (Node and LORD) green in the main checkout.

## Owner execution order, 1 November 2026

Codex implements F first, then rebases #30, then #29, then row P. Lane C takeover of #35 may run independently. The existing #30 and #29 drafts are temporarily closed, preserving their branches, to enforce one open lane-R PR. Claude reviews exact heads; the owner merges. No deployment, actual freeze, live authority change, school-data write or provider message is authorised by implementation testing.

Owned scope: Roster Apps Script writer guards and migration controls, Worker background-job/status integration, edge setup and System Health, behavioral tests and generated backend/Worker copies. The cutover runbook handoff remains with Claude after F merges, as assigned in LANES.md.

Verification gate: run npm run build before npm test after each branch switch; require the full Node and LORD suites green at the final remote head before opening the F PR. Current task head and evidence are recorded in the PR.

## Implementation and review scope

The Script Property is the Google fence. Freeze acquires the existing ScriptLock then notification/UserLock before recording the actor, start time and stable request ID. Central commits refuse with 423 and `ROSTER_CUTOVER_FROZEN`; direct archive, audit and maintenance writes are guarded too. Existing Google intake must be drained first, matching the snapshot's existing admission rule. New Worker-side absence receipts remain queued.

Private immutable preparation uploads can continue while frozen. They never bypass the established D1 writer fence. Freeze/cancel receipts sit outside imported mutable domains; cancellation tombstones prevent an old request from restarting a cancelled freeze.

A small CAS-protected control row in the existing GSIS_JOBS database holds background work before the Google RPC starts. Unknown outcomes retain the hold. Cron jobs record skipped cutover freeze; Queue wakes retry. No extra Google status call runs each minute. A real SQLite integration retains a captured absence and applies it to the actual D1 transaction path exactly once after activation.

The restoration route admits explicit activation only with `ROSTER_D1_PREPARE=import` and a confirmed frozen control row. Sign-in, same-origin checks, fresh Admin proof, both imported scopes and exact source-digest fencing still apply. No flag is changed automatically. Completion uses the signed internal service only after both D1 heads are active; partial activation and lost completion replies retain recoverable holds. A refused cancellation after Google is fenced does not strand the activation path.

Setup and System Health show age and an alert after four hours. There is no automatic release. Freeze and cancellation use the existing confirmation dialog and retain request IDs across uncertain responses.

## Verification in progress

Behavioral tests cover backend locks/writer refusal/source stability, real packed capture, actual private upload, SQLite CAS and stale replies, signed Admin controls, frozen cron and Queue behavior, exactly-once retained report delivery, partial activation, lost acknowledgement, role/origin gates and DOM controls/age warnings. Each new behavior was observed failing before its fix. All 18 components rebuild and all 19 focused programs pass. Full Node/LORD results are recorded at the final head before PR readiness; no unavailable browser/history input is counted as passing.

## Configuration and rollback

Reuse the existing shared GSIS_JOBS binding and existing Google bridge/service credentials. The additive control row does not activate D1. No live flag, actual freeze, deployment, school record or provider message was changed during implementation.

Retain the matched backend while a freeze is active. Before rolling back to code that does not enforce this property, cancel through the matched control or finish verified activation. After activation, retain the existing D1 fence and use the verified switch-back procedure; cancelling a freeze never removes that fence. Keep pending transport, source files, import receipts and provider uncertainty.

## Handoff for Claude's runbook update

After F merges, start the cutover runbook with: finish pending Google intake, Freeze Google for cutover, confirm the freeze, then start a fresh import. Check the imported records and digests before explicit activation. Cancel is for an aborted pre-fence cutover. Once Google is fenced, recover or finish activation; never restore legacy writes by deleting the freeze or authority property. A four-hour warning requires Admin attention and does not release either fence.

## Independent advisory review fixes

A Codex whole-branch reviewer found four integration gaps before publication. The outer Google dispatcher now admits freeze retries and cancellation to their Admin checks. The real Drive HTTP helper carries the private preparation exception through folder creation and resumable POST/PUT while retaining the D1 fence. Planning-lock acquisition rechecks the freeze after ScriptLock before pruning past properties. Setup preserves a reviewed, digest-bound completion retry when both stores are active but the freeze is unfinished. Each scenario was reproduced by a failing behavioral regression before its fix. Claude still reviews the final remote head.

Post-review verification: clean build of all 18 components; all 23 focused programs pass, including the strengthened real dispatcher/Drive upload, lock-interleaving and refreshed completion DOM regressions. Full exact-head remote CI and Claude review remain required.

Follow-up advisory review also identified frozen restart cleanup at the outer dispatcher. Admin-only edgeExportAbandon now remains reachable while frozen. A real SQLite restart traverses the signed Worker RPC and actual Google dispatcher, retains immutable source evidence after a lost cleanup acknowledgement, retries to completion and leaves both freeze holds and the source digest intact. The regression failed before the exemption and passes after it.
