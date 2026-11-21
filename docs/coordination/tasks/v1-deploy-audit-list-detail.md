# v1 Deploy: repair Audit list/detail contract and non-destructive archive label

- Task ID: `v1-deploy-audit-list-detail`
- Model: `Antigravity`
- Branch: `antigravity/v1-deploy-audit-list-detail`
- Status: **Claimed for implementation**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `d6e05597` (`origin/main`)

## Files Claimed
- `docs/coordination/tasks/v1-deploy-audit-list-detail.md`
- `v1/services/deploy/service.mjs`
- `v1/web/shared/deploy-ui.js`
- `tests/v1-product-deploy-audit-list-detail.mjs`

## Scope
1. **Version-scoped Audit list & detail contract (`v1/services/deploy/service.mjs`)**:
   - Require valid `versionId` belonging to the caller's school on `/auditPage`.
   - Filter `product_audit` rows to that school and version, returning numeric `total`, `versionId`, `archiveScope: "school-admin"`, and a stable `(recorded_at, event_id)` cursor (using `limit + 1` lookahead so no dangling cursor is returned on exact page boundaries, and rejecting malformed cursors with `400`).
   - Support `detailId` / `eventId` lookup within the same school and version (`404 AUDIT_EVENT_NOT_FOUND` for unknown or foreign-version events), returning `{ versionId, event }` with recorded `before`/`after` or explicit historical metadata notice when field values were not recorded.
2. **Accurate non-destructive archive label (`v1/web/shared/deploy-ui.js`)**:
   - Wrap `window.audit` so the archive button accurately reflects the per-school, per-Admin non-destructive display cutoff instead of claiming permanent version deletion.
3. **Regression test (`tests/v1-product-deploy-audit-list-detail.mjs`)**:
   - Verifies two versions, multi-page pagination with equal timestamps, detail lookup, unknown & foreign-version `404`, non-admin `403`, non-destructive archive preserving D1 evidence, and built-browser Audit tab rendering (`Showing N of M events`, `Before / after` detail load, version switching).
