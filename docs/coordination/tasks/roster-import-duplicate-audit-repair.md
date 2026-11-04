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
