# Review: PR #201 — Fix Deploy department and shared planning saves

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `ac5575fe322dcbe08521288054f2c66e3e4defde`.
- Base: `7f9e94c42b182abd536386654c8732280e4f8dbc` (accepted claim `319ed2085a7b4f7281f3751eb8326bce500d701c`; seven-path clarification published before the v1 module was added).
- CI run: [44018861436](https://github.com/helper-gsps/gsis/actions/runs/44018861436), green, all 5 jobs (4 regression shards + full-suite), at the exact head — 1,225/1,225 Node programs, 40/40 LORD checks in every shard. Product/package CI [44018874666](https://github.com/helper-gsps/gsis/actions/runs/44018874666) success at the exact head (124/124 product programs; artifact 14300783226, SHA-256 `6dcab844a3c45f795858c239938127fc7ff97de3d9cb7a361f0b4b1dda391745`). The duplicate PR-triggered product run 44021477858 also finished success at the exact head.
- PR: https://github.com/helper-gsps/gsis/pull/201 (Codex, branch `codex/v1-deploy-departments`; draft, not merged).
- Task record: `docs/coordination/tasks/v1-deploy-departments.md` (in the PR; reviewer line already names Muse).
- Bug ledger: `docs/v1/DEPLOY_DEPARTMENTS_UAT_2026-11-17.md`, DEP17-003.

## What it does

Programme Settings > Dept could add a department to the local draft, but Save returned 503 and retained an unconfirmed attempt. Root cause, reproduced against the real built browser/Worker/D1 before the fix: the v1 model imported the classic `shared/fields.js` browser script as a module, but that script exports nothing, so `patchPlanning` threw before committing. This restores the real browser-to-Worker save path for department creation, rename, removal and membership edits, plus other settings using the same transport.

- New v1 ES-module port `v1/services/deploy/planning-fields.mjs` preserves the actual browser stable-field wire encoding; shared v0.9 code stays untouched. The UI continues using the existing queue and original-operation recovery.
- `patchPlanning` now checks the patch shape (array, at most 5,000 changes, each a record with a string key and null-or-string old/value) and the optimistic field preconditions before reconstruction. Decoding validates variants, unique child keys, finite chunks, depth 19, 5,000 keys per collection and 100,000 nodes before expansion; decoded values cross the existing plain-value key/depth boundary. Malformed inputs return 400, stale fields 409, without changing the saved document.
- All department selection arrays retain known stable staff references, including `additionalDeputies`/`tls`; unknown permanent staff IDs are rejected in every department selection array. Existing role, capability, school, lease, revision and idempotency rules remain in force.
- A small v1 UI hook suppresses the copied initializer's browser-only committee seed for explicit v1 lists (`planning402 = 1` for schema-1 docs). Saved committee definitions and legacy leadership remain intact. No controls or stored definitions are retired.
- The same codec fixes organisation settings for Committees/CCAs/PLT/Events, duties and aSc settings. New-department IDs must still be created in the owning UI before Excel import; no generic restore endpoint or new-ID importer is added.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci` (repo root and `v1/`): exit 0.
- New test `tests/v1-product-deploy-departments.mjs`: exit 0. "PASS browser/ESM field parity and real built Worker/D1 department/all organisation patches: add/rename/remove, leadership/member arrays, legacy history, reload/isolation, receipts, stale/malformed/security rejection, Dept export/preview/import, duties and aSc settings".
- New browser test `tests/v1-product-deploy-departments-browser.mjs`: exit 0. "PASS built browser/Worker/D1: department add/cancel/save/reload, stable rename, Head/multiple Deputies, delete/unassigned and no phantom committee defaults".
- Named regressions, all exit 0: `v1-product-table-deploy-settings`, `v1-product-deploy-workbooks`, `v1-product-deploy-fortnight-browser`, `v1-product-deploy-save-recovery-browser`, `v1-product-deploy-internal-links`, `v1-product-deploy-internal-links-browser`, `v1-product-v09-frontend-parity`.
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- `node scripts/v1/build.mjs`: exit 0.
- `node scripts/v1/verify-build.mjs`: exit 0. "PASS real Wrangler LOCAL upgrade from deployed 0001: additive migrations applied once, all five upgrade tables present; no cloud credentials or operations".
- Merge-tree against current main: clean, no conflicts.
- Scope: the diff against the base is exactly the seven claimed allowlist paths, 444 insertions / 12 deletions. `git diff --check` clean.
- Secrets scan of the diff: none.
- Read the new module `v1/services/deploy/planning-fields.mjs` in full and the diffs of `v1/services/deploy/model.mjs` and `v1/web/shared/deploy-ui.js`. The port keeps the valid client wire format, including the chunked order/keys encoding and the `D1-06B|Pump Room` venue identity special case, and hardens decoding with the stated bounds (unique sibling keys, typed metadata, finite chunk counts, depth 19, 5,000 keys/collection, 100,000 nodes). Decoded objects are built with `Object.defineProperty`, so an encoded `__proto__` key cannot pollute the prototype. The `validated` wrapper used for the codec calls is the pre-existing model helper that maps thrown errors to validation results, which is what turns the old 503 into a definite 400/409. The UI hook only sets the seed-suppression flag for schema-1 v1 docs with organisations present.
- Read the bug ledger: the reproduction, root cause, related-operation study and the v0.9 read-only comparison (v0.9.9y `d9d180c`) are recorded; no v0.9 path is edited.

## Findings

None. No findings.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Owner authorised the bounded fix and study ("bug log: deploy: programme settings : dept unable to add / save department. bug fix and study operations related to this."); exact seven-path allowlist, clarification published before the module was added.
- Q02 Design and ownership: pass. v1-owned port of an established wire contract; v0.9 source untouched; no new permission rule.
- Q03 Security and privacy: pass. Decode-time bounds reject amplifying/malformed encodings before expansion; unknown staff IDs rejected; authority, school, lease, revision and idempotency checks unchanged; no authority or Contacts writer change.
- Q04 Concurrency and recovery: pass. Optimistic field preconditions, stale → 409, exact retries use the original durable result, changed intent rejected; original-receipt recovery retained for uncertain saves.
- Q05 Resources and maintainability: pass. Bounded payloads (5,000 changes, 100,000 nodes); no new dependency, migration or workflow change.
- Q06 Verification: pass. Both new tests and all seven named regressions pass locally; exact-head Node/LORD CI and product/package CI green.
- Q07 Handoff and review: pass. This record; PR names the reviewer; draft, not merged.
- Q08 Release boundary: not applicable. No deployment authorised for this bug task; no live records, provider sends or migration. Visible behaviour changes Deploy plus shared web assets; the shared backup import closure can change all eight owner Worker bundles, so a later selective rollout must establish its artifact/dependency set. A separately approved rollback must preserve saved organisation/leadership fields, HR choices, publications and receipts; code rollback does not undo accepted saves. F5 OPEN; T1B-01/T1B-02, hosted/runtime UAT and hosted restore Not tested.

## Release notes

Department Add/Save/reload works; rename preserves ID and assignments; removal keeps the teachers, who return to Unassigned when appropriate. Head, Deputy, additional Deputies, TLs and members are retained. Empty v1 committee lists no longer show unsaved legacy additions. Other shared planning saves can complete.
