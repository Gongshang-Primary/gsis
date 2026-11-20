# Task: v1-roster-backup-ledger-and-archive

- **Lane:** GSiS v1 (`v1/services/roster`, `tests/v1-product`)
- **Implementer:** Antigravity
- **Reviewer:** Muse (exact head commit)
- **Coordinator / Merger:** GPT
- **Branch:** `antigravity/v1-roster-backup-ledger-and-archive`
- **Status:** Locally verified (ready for Muse exact-head review)

## Scope
Ported the remaining 6 Roster backup-ledger and archive probe allowances (`F09` and `F10`):
1. `POST /backup-ledger` (`roster.admin`) in `v1/services/roster/backup-ledger.mjs`:
   - `read`: returns paginated ledger rows over v1 Roster exports (`roster_exports`, `roster_drive_exports`, `backupLedgerEntries`), status summary, backup config flag, and verification request history matching `backup-ledger.js`.
   - `verify`: idempotently verifies R2 artifact readback & SHA-256 digest (or ledger record state) and records a durable `backupLedgerRequests` entry in `roster_records` via `prepared()` + `commit()`.
   - `restore`: explicitly refuses live HTTP restore (`409 RESTORE_ISOLATED_ONLY`) per `OPERATIONS.md`, directing operators to the isolated empty-target `restoreOwner` procedure.
2. `POST /edge/archive` in `v1/services/roster/archive.mjs`:
   - Read-only projections for `history` (`roster.own`), `calculations` (`roster.own`), `statistics` (`roster.read`), and `openingBalances` (`roster.admin`), all returning `archive: { readOnly: true, throughDate, id }` matching `archive.js` and `roster-operations-ui.js:704`.
3. `POST /operations` (`operation: "archiveColdOutput"`, `roster.admin`) in `v1/services/roster/archive.mjs`:
   - Captures an immutable verified cold-output archive snapshot/manifest into private R2 (`cold-archive`) with SHA-256 readback verification, retaining all authoritative D1/R2 records (`deletionEnabled: false`), and returns `{ revision, archive: { months, lastRun }, deletionEnabled: false, retained: true }` matching `roster-operations-ui.js:958`.
4. Removed all 6 `F09`/`F10` entries from `tests/v1-product/operation-probe-allowlist.json` and added regression coverage in `tests/v1-product-roster-backup-archive.mjs`.

## Local Verification (`TZ=Asia/Singapore`)
- `node tests/v1-product-roster-backup-archive.mjs` — PASS
- `node tests/v1-product-operation-probe.mjs` — PASS (`knownMissing: 18` on clean base; **24/24 probe allowances cleared across PRs 1–7!**)
- `node tests/v1-product-roster-service.mjs` — PASS
- `npm run build` + `git diff --exit-code -- roster-update/ public/ shared/` — PASS (zero v0.9 drift)
- `node scripts/v1/build.mjs` + `node scripts/v1/verify-build.mjs` — PASS (all 9 Wrangler dry-runs + local upgrade check)
- `git diff --check` — PASS

## Remaining Gates
- Independent exact-head review by Muse; merge & coordination by GPT.
- Hosted runtime UAT, F5, and official T1B-01/T1B-02 remain Not tested / OPEN. No live deploy, live HTTP restore, or provider activation performed.
