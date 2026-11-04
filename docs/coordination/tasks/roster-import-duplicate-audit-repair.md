# roster-import-duplicate-audit-repair: repair the existing duplicate audit ID (owner ruling a)

- Status: authorised (owner 4 Nov 2026 08:2x: "take a) Give the decision record a fixed suffix, e.g. …-decision"); lane R, Codex
- Depends on: PR #71 (guard) merged first
- Reviewer/model: Claude
- Blocks: next D1 cutover attempt

## Ruling
Option (a): the later row of a colliding Stapler request/decision pair keeps its event and gets a deterministic ID `<originalId>-decision` (the request row keeps the original ID). Applies to every existing pair produced by the old producer bug, not only `3202a57b-1965-4341-b556-adbe2bf1f785`.

## Build
1. Deterministic, idempotent repair: find audit pairs where a `decideStapler` row shares its ID with a `requestStapler` row; rename the decision row's ID to `<id>-decision`; keep `planningRequestId` = original ID on both. Running twice changes nothing.
2. Same rule applied in the import record preparation (so a source captured before repair still imports), and in Google storage via an Admin-run, receipt-backed repair command (dry-run first, showing count of pairs; then apply).
3. Never touch other rows; refuse if a `<id>-decision` already exists with different content.
4. Parity: the import manifest and parity check must expect the suffixed ID.
5. Tests: one pair repaired; idempotent rerun; no-op when clean; conflicting suffix refused; import of the 3-4 Nov shaped source succeeds (no EDGE_RECORD_ID).
No live run in the PR; the owner runs dry-run then apply after deploy.

## Bounded implementation claim

Model: Codex. Reviewer: Claude at the exact final head. Updated 4 November 2026, Asia/Singapore. Branch `codex/roster-import-duplicate-audit-repair`. The tested ordered predecessor is PR #65 head `64d57cbed36776d6cee7093984699b6ab343eea5`, tree `24006514dfcbdee7ec5bed3c7b6a4d34cbd1ccca`; it contains the approved #71 guard and #73 cap. All three predecessor PRs have full green GitHub CI. The repair draft remains dependent on the owner's preceding merges, including #71.

Owned canonical scope is `shared/roster-import.js`, the dedicated Admin command and stored-document commit option in `backend/RosterOperations.gs`, one date-free operation in `roster-update/public/_worker.js`, focused synthetic tests, this record and CHANGELOG. Regenerate the tracked outputs with the canonical build. Preserve all other commands, settings, manual and peer work, notification state, immutable archives and compressed plan payloads.

The pure projection repairs only supported top-level audit pairs before record encoding. The same function serves the Google Admin command. Dry-run returns a pair count and a digest bound to the full raw source. Apply checks current Admin authority, locks and reloads the source, verifies the preview, and stores one command receipt atomically with the repair. Exact receipt retries precede stale-preview checks. Clean input is a no-op. Ambiguous pairs, occupied suffixes and changed source identity refuse without deleting events.

Import manifest and cached-scope parity use the projected records. Captured bytes and `sourceDigest` remain raw and unchanged. A later live Admin apply changes audit, revision and receipts, so an earlier capture correctly becomes stale for drift and cutover checks. Do not hide those changes, widen drift tolerance, change authority or restart a session.

Acceptance includes the owner's five cases, multiple-pair atomic refusal, input immutability, indexed/cached preparation, archive preservation, current Admin authority, normal/split writes, cold/restored receipt replay, raw field preservation, packed-plan fence stamps, capacity and original-source checks. Require independent review, canonical build and full exact-head GitHub Node/LORD CI before immediate Claude handoff. No deployment, live command, configuration change, freeze or session restart is authorised by this claim.

## Retained capture verification

A read-only local check of the retained 3–4 November capture reproduced `EDGE_RECORD_ID` at the original strict encoding boundary. Its 20,228,544 bytes still match SHA-256 `83e30bcc6f9b55730d5b8a50c2ba4bb37a813225ee52f9e63ec1e9315f07d845`. The pure projection found one supported pair. Audit event count stayed 3,634; unique audit IDs increased from 3,633 to 3,634. Strict encoding of the projected captured state succeeded with 16,124 records. A second projection found zero pairs and retained the same array. Both the parsed captured source and the original file stayed unchanged.

This check validates top-level record encoding, not a live import or archive retrieval. The complete and indexed import paths, retained preparation, scope digests and opaque archive preservation are checked with synthetic fixtures. No retained record contents or staff data are included here.

## Admin command after owner deployment

No command below has been run against live services. Use the signed-in Admin's existing same-origin `POST /api/operations` route. Send `{"operation":"repairStaplerAuditIds","mode":"dryRun"}` first. The response gives `rule`, `version`, `pairs`, `revision` and `previewDigest`, with no row identities or contents. Dry-run writes nothing.

For an approved nonzero count, retain one UUID and send `{"operation":"repairStaplerAuditIds","mode":"apply","requestId":"<same retained UUID>","previewDigest":"<dry-run digest>"}`. Apply reloads under ScriptLock and refuses a stale digest. A real repair stores audit, revision and a standard actor/command receipt together; the response gives pair count, applied state, revision and request ID. An exact retry returns the retained result even after later changes. `{"operation":"receiptStatus","command":<original apply command>}` confirms the receipt and its accepted time/revision. A new dry-run on clean state reports zero; clean apply writes nothing. Never change the request identity merely because a response is lost.

Only the internal repair path bypasses capture, schema normalisation, evidence/plan packing and derived-package removal. It retains the new-audit guard, capacity checks, original source identity checks, split content checks and existing timetable/Venues fences. Fence calculations use a temporary lazy plan view; persisted compressed payloads, aliases and timetable packages stay intact. Other commands keep their existing commit path.

Local synthetic evidence passes eleven projection groups, twenty-four Admin checks, the Worker date-free check and the unchanged guard/import/native/split/capacity/backend regressions. The stale-source regression confirms exactly audit, revision and receipts change after apply; the old capture fails cutover freshness without any authority write. The pure projection has passed independent review. All eighteen components rebuild, all eighty-eight Apps Script files pass syntax checks, and all eighteen installed components match canonical runtime verification. Thirteen focused programs passed again against the rebuilt files, including actual historical clean-cache resume. Independent whole-branch review also passed with no actionable findings. Final exact-head GitHub CI and Claude review remain release gates; this record does not claim deployment or live verification.
