# v1 Deploy: repair Audit list/detail contract and non-destructive archive label

- Task ID: `v1-deploy-audit-list-detail`
- Model: `Antigravity`
- Branch: `antigravity/v1-deploy-audit-list-detail`
- Status: **Ready for Muse review**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `d6e05597` (`origin/main`)

## Files Claimed
- `docs/coordination/tasks/v1-deploy-audit-list-detail.md`
- `v1/services/deploy/service.mjs`
- `scripts/v1/build-web.mjs`
- `tests/v1-product-deploy-audit-list-detail.mjs`

## Scope
1. **Version-scoped Audit list & detail contract (`v1/services/deploy/service.mjs`)**:
   - Required valid `versionId` belonging to the caller's school on `/auditPage`.
   - Filtered `product_audit` rows to that school and version, returning numeric `total`, `versionId`, `archiveScope: "school-admin"`, and a stable `(recorded_at, event_id)` cursor (using `limit + 1` lookahead so no dangling cursor is returned on exact page boundaries, and rejecting malformed cursors with `400`).
   - Supported `detailId` / `eventId` lookup within the same school and version (`404 AUDIT_EVENT_NOT_FOUND` for unknown or foreign-version events), returning `{ versionId, event }` with recorded `before`/`after` or explicit historical metadata notice when field values were not recorded.
2. **Accurate non-destructive archive label (`scripts/v1/build-web.mjs`)**:
   - Updated the Deploy Audit archive button and confirmation text to accurately reflect the per-school, per-Admin non-destructive display cutoff (`Archive displayed audit (this Admin · school view)`).
3. **Regression test (`tests/v1-product-deploy-audit-list-detail.mjs`)**:
   - Verifies two versions, multi-page pagination with equal timestamps, detail lookup, unknown & foreign-version `404`, non-admin `403`, non-destructive archive preserving D1 evidence, and built-browser Audit tab rendering (`Showing N of M events`, `Before / after` detail load, version switching).

## Verification (`TZ=Asia/Singapore`)
- `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-deploy-audit-list-detail.mjs` — PASS
- `TZ=Asia/Singapore npm run build && git diff --exit-code -- roster-update/ public/ shared/` — PASS (zero v0.9 drift)
- `TZ=Asia/Singapore node scripts/v1/build.mjs && TZ=Asia/Singapore node scripts/v1/verify-build.mjs` — PASS
- `git diff --check` — PASS
