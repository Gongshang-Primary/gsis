# Task: v1-roster-backup-ledger-and-archive

- **Lane:** GSiS v1 (`v1/services/roster`, `tests/v1-product`)
- **Implementer:** Antigravity
- **Reviewer:** Muse (exact head commit)
- **Coordinator / Merger:** GPT
- **Branch:** `antigravity/v1-roster-backup-ledger-and-archive`
- **Status:** Claimed (in progress)

## Scope
Port the remaining 6 Roster backup-ledger and archive probe allowances (`F09` and `F10`):
1. `POST /backup-ledger` (`roster.admin`) — `read` (paginated ledger over v1 Roster exports/Drive exports and verification requests), `verify` (idempotent R2/digest verification request), and `restore` (explicitly refuses live HTTP restore with `409 RESTORE_ISOLATED_ONLY` per `OPERATIONS.md`).
2. `POST /edge/archive` (`roster.own` for `history`/`calculations`, `roster.read` for `statistics`, `roster.admin` for `openingBalances`) — read-only historical archive projections matching `archive.js` and `roster-operations-ui.js`.
3. `POST /operations` (`operation: "archiveColdOutput"`, `roster.admin`) — immutable R2 cold-output archive snapshot/manifest retaining all authoritative D1/R2 records (`deletionEnabled: false`), matching `roster-operations-ui.js:958`.
4. Remove all 6 `F09`/`F10` entries from `tests/v1-product/operation-probe-allowlist.json` and add regression coverage in `tests/v1-product-roster-backup-archive.mjs`.

## Guardrails
- No v0.9 source or generated files modified (`npm run build` zero drift).
- No live HTTP restore; no deletion of authoritative D1/R2 records; no live deploy or provider activation.
