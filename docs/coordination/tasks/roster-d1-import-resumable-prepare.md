# roster-d1-import-resumable-prepare: split D1 import preparation into steps under the Apps Script limit

- Status: implementation complete; validation and exact-head review tracked in PR #32.
- Owner/model: Codex (builder)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 Oct 2026 12:35
- Branch: codex/roster-d1-import-resumable-prepare
- Base SHA: 66983af9644a8d1f6095d6a93acffe2ba88f4d57
- PR: https://github.com/helper-gsps/gsis/pull/32 (closed during implementation; reopen only after the full suite is green)
- Files/domains owned: backend/RosterEdgeMigration.gs (export manifest/part/resume), backend/RosterAuditExport.gs (immutable evidence files), shared/roster-import.js (freeze in batches, progress), roster-update/public/edge-roster.js and edge-setup UI (step progress, timing), generated copies, tests.
- Out of scope: activation, fencing, D1 authority; the Google-backup task.

## Evidence (31 Oct 2026 owner rehearsal)
Reference 6f550ae7-a19c-4087-9900-501c3ac8e2c1; D1 session created 12:14:00 SGT, `preparing` until the 10-minute lease, then `failed` 12:24:23 ("The frozen source is incomplete"). `rosterEdgeExportManifest_` does snapshot, validate, read every model file and allocation audit archive, gzip and hash every part, and upload one container in a single execution. On the real 16.08M file this exceeds the 6-minute Apps Script limit and is killed before recording failure. Roster showed "temporarily unavailable" while it ran. D1 heads stayed legacy; two import locks remain for the failed session.

## Required
1. **Steps, each under 2 minutes of Apps Script time** (leave margin for slow Drive):
   a. Snapshot: under the script lock, read state and references, compute the source digest, write the descriptor. Release locks immediately.
   b. Freeze in batches: each call freezes and uploads a bounded set of parts (by size, e.g. 2M source characters per call), records per-part digest and Drive file ID in the descriptor, and returns. Model files and audit archives are read only in the batch that needs them.
   c. Manifest: after all parts exist and verify, write the manifest and mark `ready`.
   Each edge-setup poll advances exactly one step; the existing `preparing` reply carries `step`, `done`, `total`.
2. **Never block Roster for longer than step (a).** Steps (b) and (c) hold no production lock and use no more than one execution at a time (a lease per step, not per session).
3. **Resume safely:** a killed step leaves the descriptor at its last completed batch; the next poll redoes only that batch (idempotent by part ID and digest). The source digest pins the snapshot: if Google changed since (a), parts still come from the frozen snapshot copy, never from the live file.
   - Store the frozen snapshot itself as a Drive file in step (a) (one write of the operations JSON already in memory), so later batches read the frozen copy, not the live state.
4. **Timing:** record start/finish per step in the descriptor; edge-setup shows "Preparing: step 3 of 9 · 47 s".
5. **Restart path:** an explicit restart clears the failed session's D1 import locks and old descriptor (existing abandon path), keeping evidence.

## Acceptance
- Production-size fixture (16M operations, 10+ model files, archives) completes preparation with every call under a simulated 2-minute budget.
- Kill simulation after any batch: the next poll resumes without duplicate parts; final manifest digest equals an uninterrupted run.
- Roster read and save requests succeed between steps (no lock held across polls).
- Live-file change after step (a) does not change the frozen parts or digest.
- Existing import tests pass; full suite (Node and LORD) green in the main checkout.

## After merge
Owner deploys, then reruns the rehearsal import on a quiet day (explicit restart with a new request ID). Claude checks D1 against Google.

## Implementation rulings (31 October)

- D1 controls preparation-step leases and accepted checkpoints only. Google remains the production Roster authority.
- Each successful step releases its lease. A timed-out execution keeps a lease through the Apps Script execution horizon; stale responses cannot advance the checkpoint.
- Private Drive checkpoints hold large part maps. Script Properties retain a small locator. Finalization writes metadata, not one large container.
- Investigation found allocation-audit JSON was overwritten in place. The matched backend will write immutable versioned audit JSON instead, retaining old files and using the existing archiveFileId reference. This removes unbounded revision-pinning work from the snapshot lock. Human-readable text exports keep their existing behavior.
- Snapshot capture performs only current-state/reference capture, digesting and one frozen-source write under production locks. Model/archive bodies are read in later steps.
- Native object preparation and global record identity/digest calculation are isolated from bounded part uploads. Preserve Store.encode global identities and the existing import manifest format. The budget fixture measures these stages separately; live Apps Script/Drive timing remains an owner rehearsal gate.
- Restart atomically resets only a permitted D1 import before idempotent Google descriptor cleanup. Cleanup failure remains explicit and retries the same identity. Activation remains blocked by the production recovery gateway.
- Row I is paused at local checkpoint 24594853c5b621cf929e16fe27e9dfe09bc0c329. Its remote draft contains the claim only. Rows I, C and P wait until rows R and D1 are merged.

## Local verification in progress

The production-size test uses exactly 16,080,000 operations characters, 12 models and 16 audit archives. It produces 149 identical parts over 105 preparation steps. It survives 179 simulated post-upload terminations with the same final manifest and part bytes. Maximum simulated call cost is 96,998 ms uninterrupted and 107,123 ms when resumed. These are deterministic simulated I/O costs, not live Apps Script measurements.

Deployment gate: install the resumable exporter and immutable audit writer together; let any old preparation or audit-export execution finish before the owner starts the rehearsal. Do not roll back a live v2 preparation to code that cannot read its checkpoints. Source and checkpoint files remain evidence on cancellation.

Full Node/LORD verification and Claude exact-head review remain required before merge. No deployment or authority change was performed. The claim-only PR is closed until full verification passes.

The first complete CI run at `bc47d2b97d8769a0e0a0473c5961a9e47d7668f0` rebuilt all components and passed 896 of 897 Node scripts. The remaining legacy migration test did not emulate the now-required signed `edgeExportAbandon` acknowledgement. Its restart fixture is updated to exercise that acknowledgement and its session/reset bindings; the production cleanup guard remains enforced. LORD was not reached in that failed run. The final exact-head rerun and its result are recorded in PR #32.

## Handoff and verification

`TZ=Asia/Singapore npm run build` rebuilt all 18 components. The 18 focused import, immutable-audit, recovery, preparation-control and UI programs pass. The full Node and LORD suite runs through the repository Actions workflow against the exact branch head, with the real Git history and browser. No unavailable local browser or packaging-history check is counted as passing.

Independent review corrected checkpoint-source anchoring and restart cleanup races. Cleanup status and its original reset ID now survive reload, and a second tab cannot start another import until cleanup is confirmed. Historical records, captured source files, checkpoints, parts and receipts remain retained.

Production authority is unchanged. The implementation adds no automatic activation or deployment. After row R is reviewed and owner-merged, row D1 owns backup and switch-back work. I, C and P remain paused until both D1 rows merge.
