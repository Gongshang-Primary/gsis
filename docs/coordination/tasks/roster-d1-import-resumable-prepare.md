# roster-d1-import-resumable-prepare: split D1 import preparation into steps under the Apps Script limit

- Status: approved, **top priority** (owner 31 Oct 2026: "log for codex, re-prioritise as top priority")
- Owner/model: Codex (builder)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 Oct 2026 12:35
- Branch: codex/roster-d1-import-resumable-prepare
- Base SHA: current main
- PR: none
- Files/domains owned: backend/RosterEdgeMigration.gs (export manifest/part/resume), shared/roster-import.js (freeze in batches, progress), roster-update/public/edge-roster.js and edge-setup UI (step progress, timing), generated copies, tests.
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
