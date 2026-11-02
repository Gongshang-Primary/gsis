# roster-import-session-archive: R8 retained import capacity blocker

- Status: claimed, 2 November 2026, Asia/Singapore
- Owner/model: Codex
- Reviewer/model: Claude, exact final head
- Branch: codex/roster-import-session-archive
- Base SHA: e605881acc044e562c3435c0f11dc9af7ff68144
- Priority: blocker for tonight; merge by 17:00. Quiet-mode implementation is paused.
- Authorised scope: Admin Archive retained import sessions; automatic safe archival; cap 24. Keep the two newest sessions and every session not abandoned. Preserve all records.
- Files owned: shared/roster-import.js, roster-update/public/edge-roster.js and _worker.js, shared/edge-setup.js/html, focused tests and builder-generated copies/bundles.
- Out of scope: operational records, live archive/cutover/deployment, R2 expiry/deletion, messages, quiet-mode product changes.

## Implementation plan
1. Add a bounded, resumable archive ledger. Select only abandoned sessions outside the newest two, with no active import or cleanup/runner lease.
2. Freeze the selected session's source tables during copying. Copy exact session, preparation, locks, parts/receipts, staged rows and any retained server-continuation evidence in bounded gzip JSON pages. Keep other rollback evidence in D1.
3. Use SHA-256 content addresses and a manifest. Read back every page and the final compressed manifest, verifying compressed and JSON digests before one guarded D1 deletion transaction. Retain the archive ledger and R2 objects permanently.
4. Resume after interruption or lost acknowledgement without duplicate deletion; guard concurrent archivers and recheck the newest-two/abandoned rule at commit.
5. Add current-Admin UI/API support and bounded automatic archive steps during import preparation. Raise MAX_RETAINED_SESSIONS from 8 to 24.
6. Prove exact round-trip, corruption/write failure safety, lease/race safety, retention rules, interrupted recovery and a subsequent new import. Regenerate with npm run build and run full Node/LORD CI before draft PR.

## Verification and handoff
Pending implementation. Claude reviews the exact final head; owner merges. No live records, settings, deployment or messages changed.
