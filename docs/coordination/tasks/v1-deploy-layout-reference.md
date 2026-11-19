# v1 Deploy layout reference PDF and legacy command-queue cleanup (F12)

- Model: Antigravity
- Status: implemented and locally verified; exact-head CI and Muse review pending
- Updated (Asia/Singapore): 20 November 2026
- Base: `origin/main` `7ee2418`
- Coordinator / Merger: GPT
- Reviewer: Muse at the exact PR head
- Owner scope: clear both remaining `F12` probe allowances in Deploy — port authenticated `/api/deploy/layout-reference` returning `Classroom-Layout-21-Sep-2026.pdf` behind Core `deploy.read` authorization, and remove the obsolete v0.9 Apps Script `/api/commands` caller from the built v1 Deploy frontend without editing v0.9 source files.

## Exact file allowlist

1. `docs/coordination/tasks/v1-deploy-layout-reference.md`
2. `v1/services/deploy/layout-reference.mjs`
3. `v1/services/deploy/service.mjs`
4. `scripts/v1/build-web.mjs`
5. `tests/v1-product/operation-probe-allowlist.json`
6. `tests/v1-product-deploy-layout-reference.mjs`

## Boundaries and invariants

- `/api/deploy/layout-reference` requires a valid school session with `deploy.read` capability (Core-authorized, school-scoped); unauthenticated (401) and ordinary non-Deploy accounts fail closed (403/503) without returning PDF bytes.
- Returns exact `Classroom-Layout-21-Sep-2026.pdf` bytes (142,756 bytes, byte-identical to v0.9 reference) with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="Classroom-Layout-21-Sep-2026.pdf"`, `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`.
- Built v1 Deploy frontend replaces the flag-disabled `edgeCommandSend` `/api/commands` caller while preserving line count and native direct `/api/deploy/change` writes.
- Zero edits to v0.9 source files (`public/`, etc.) or generated v0.9 outputs. No merge, deployment, live-data access or migration.

## Verification evidence (`TZ=Asia/Singapore`)

- `node tests/v1-product-deploy-layout-reference.mjs`: PASS (401 unauthenticated, fail-closed non-Deploy denial, 200 authorized exact 142,756-byte PDF match with v0.9 reference, `/api/commands` removed from built `deploy/app.js`).
- `node tests/v1-product-operation-probe.mjs`: PASS (both `F12` entries removed; zero stale/unallowed entries).
- `node tests/v1-product-deploy-storage.mjs`: PASS (strict50 metrics intact).
- `npm run build` + production-path `git diff --exit-code`: PASS (zero tracked drift).
- `node scripts/v1/build.mjs` + `node scripts/v1/verify-build.mjs`: PASS (9 Wrangler dry-runs + local additive migration upgrade).
- `git diff --check`: PASS.
- Q01–Q06: pass locally; Q07: awaiting exact-head CI and Muse review; Q08: deployment not authorised; hosted UAT, F5 and official T1B-01/T1B-02 remain unchanged.
