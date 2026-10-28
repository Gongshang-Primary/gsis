# Roster 098c implementation plan

Goal: deliver the accepted reliability work and queued Stapler, cache and status changes on 098b.
Architecture: Google remains authoritative. Existing authenticated Workers serve immutable compressed cache parts and metadata, preserve command identities, and dispatch retained notification intent. Cache errors never undo confirmed saves.
Spec: QUEUED_SCOPE.md plus the user's accepted five item reliability table and commit instruction.
Baseline: 3f92305d99cd27289d16cbd9a21325979f08690c.

Global constraints: no production deployment or sends; no ownership migration; retain SMC decisions and peer approvals; Admin only System Health header link; teacher and Venues projections exclude drafts/private details; same date and existing request identities govern retries.

Review focus: late profile responses while editing; shared recess conflicts; cache publication/deletion races; uncertain email resolution and idempotency; stale save conflicts and loss of response after commit.

## Task 1: planner continuity and header

Files: roster-update/public/roster.js, roster.css, roster-stapler-ui.js; tests/roster098c-planner-shell.cjs.
Add explicit isPlanning to Stapler UI. The shell protects active planning independently of dirty state before and after background requests; preserve access checks and local recovery. Header link uses shared button styling and Admin only visibility. Test actual shell freshness, clean/dirty plans, delayed responses and role changes.

## Task 2: recess placement and individual/cohort movement

Files: shared/roster-stapler.js, roster-update/public/roster-stapler-ui.js, roster-stapler.css; tests/stapler098c-recess.cjs and browser case.
Allow recessMove from Pit onto original class. Preserve duration/class identity. Expose individual and cohort display/movement without implicit ownership changes. Existing validation and displaced lesson feedback remain. Test Pit, time moves, individual/group, boundary and collision cases, undo/save/reopen.

## Task 3: safe peer email review and diagnostic propagation

Files: backend/RosterPeerMail.gs, backend/RosterOperations.gs, roster-update/public/system-health.js/html, roster-update/public/_worker.js, notification-worker/index.js, shared/edge-health.js; focused new tests.
Add Admin authorised read and mark-reviewed operation for uncertain peer email, stable request ID and expected row token; preserve uncertain status and provider history, suppress reviewed issue from active health without resend. Keep cancellation of provably unsubmitted email distinct. Preserve safe code, reference, operation and stage through service failures. Verify receipt recovery, rejected stale rows, authorization and no MailApp calls during review.

## Task 4: cache parts and bounded maintenance

Files: new roster-update/public/roster-recovery-timetable-cache.js, backend/RosterTimetableBatch.gs, _worker.js, notification-worker/index.js; new cache tests.
Reuse gzip-parts-v1 with immutable independently hashed baseline and suspended parts. Manifest identity is independent of client delta keys. Fresh backend authorised manifest selects source and projection. R2 remains private. Existing D1 stores cache-only references/cleanup fences if needed. Save/upload invalidates and prepares relevant parts through Worker without changing Google authority. Bounded cleanup/retry uses metadata, no full Roster scan on idle cron. Test unchanged hashes, corrupt/missing parts, auth, publish/delete races, save acknowledgement and write failure.

## Task 5: reliability gaps, release and review

Check existing absence receipt states and same-ID retry, reliefBatch surgical save and conflict preservation, notification outbox recovery/accepted/delivered distinctions. Add regressions for any changes, retain proven paths otherwise. Add surgical Stapler save payload if compatible with existing merge contract. Sync generated files only after agents finish. Run focused tests, broad current suite and component packaging checks. Review final diff, fix important findings, commit 098c and package the three matched components. Persist release artifact; no live deployment.

Execution: red then green for changed behavior; independent source ownership for parallel work, root integrates shared files and generated output. User's commit instruction already authorises execution; no repeated approval gate.

## Completion ledger

Tasks 1–3: implemented and verified with actual browser shell, signed backend, receipt, fresh-authority and diagnostic metadata tests.
Task 4: private canonical cache uses existing R2/GSIS_JOBS bindings, independently compressed immutable parts and current Google source checks. Preparation is best effort after successful writes and repaired on demand. Deliberately no new repair queue, ownership migration or minute cron timetable job. Daily cleanup has publication fences, integrity checks and continuous unreferenced grace.
Task 5: established absence, relief and notification recovery paths retained and regression checked. The final source review identified and fixed missing-email-store false zeros, corrupt cache-reference deletion and quarantine/publication races. Generated component packaging, syntax and standalone Worker checks passed. Validation limits are documented separately.

Storage semantics: surgical payloads and field-level conflict checks do not make Google Drive document writes physical row updates. Google save, D1 cache publication and R2 object writes are separate operations. The authoritative receipt is independent of the disposable cache.

No live deployment, notification send, ownership transfer or production state modification was performed.
