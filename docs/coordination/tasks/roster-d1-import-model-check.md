# roster-d1-import-model-check: D1 import fetches models without re-checking the whole Roster

- Status: review
- Owner/model: Claude
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 28 Oct 2026 21:00
- Branch: claude/roster-d1-import-model-check
- Base SHA: 41bde7bc18775fa16e6b4e93e7413cc9edffe986
- Current head SHA (or PR head; avoid self-referential commit hashes): pending
- PR: pending
- User-authorised scope: Song Wee, 29 Oct 2026 ~05:00 SGT: make the import less stringent; "yes" to changing edgeModel and edgeAudit only.
- Files/domains owned (include generated outputs): backend/Code.gs, backend/RosterEdgeMigration.gs (edgeModel, edgeAudit dispatch only); generated Roster_Backend_v0.9.9.gs and Deploy_Backend_v0.9.9.gs; related tests.
- Out of scope: activate/fence logic, Worker import flow, absence policy, UI.
- Acceptance checks: import no longer fails with "Roster changed during export" when unrelated Roster data changes between export and model/audit fetch; a model or audit archive whose content differs from the export still fails; activation digest check unchanged.

## Decisions and changes
- `edgeModel` reads the register (`rosterIndex_`) and the immutable model file; it no longer rebuilds and compares the whole-Roster fingerprint. Each upload has a new model ID, so a fetch by ID cannot return different content.
- `edgeAudit` reads the archive reference from the operations state (`rosterOperationsState_(true)`) and validates the archive; no whole-Roster fingerprint.
- Unchanged: export snapshot and digest, admin check, activation (`edgeFence`) exact-digest check under the script and notification locks. If Roster data changes during an import, D1 holds an older copy and activation refuses until a fresh import matches.
- Changed in `backend/Code.gs` and `backend/RosterEdgeMigration.gs`; regenerated `Roster_Backend_v0.9.9.gs`, `Deploy_Backend_v0.9.9.gs`.

## Verification
- New `tests/roster099a-edge-model-fetch.cjs`: PASS (model and audit returned with a stale fingerprint; no snapshot call; missing model/archive and non-admin still refused).
- `tests/roster094-edge-roster.mjs`: PASS.
- Build: Apps Script syntax gate passed.
- Not run: full suite on this branch; live import.
- Package: `Roster_Backend_v0.9.9a-importfix.gs`, SHA-256 2a8a81b2a92f25ac1047a27bdf9b5d0c76fdca001955c6e800c5d1a6455fb20d (includes fc0abb9 latest-wins). Delivered to owner, not stored in git.

## Review
Codex reviewed 41ed57c: `edgeAudit` used the current date-to-archive pointer, not the archive captured by the export; the test did not prove that changed content is refused.
Fix (next commit): the Worker (`roster-update/public/edge-roster.js`) sends the exported `modelFile` and `archiveFileId`; the backend requires them and returns 409 when the current register entry or archive pointer differs, before reading anything. Tests now cover a changed archive pointer, a changed model file behind the same ID, missing identities, malformed and unreadable archives, and the Worker sending the exported identities. `roster094-edge-roster.mjs` (end-to-end import) still passes.
Deployment note: backend and Roster frontend must now be deployed together; the backend refuses fetches without the exported identities.

## Deployment

## Handoff
Next: owner deploys the backend (New version), retries Import. Codex reviews the PR head.
