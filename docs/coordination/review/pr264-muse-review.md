# Review of PR #264 — Deploy Audit: repair version-scoped list/detail contract and archive label

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #264, "fix(v1/deploy): repair Audit version-scoped list/detail contract and archive label". Branch `antigravity/v1-deploy-audit-list-detail`. Head reviewed: `c7ce9ef6`.
- **Status at review:** OPEN, not a draft. Product CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head c7ce9ef6.** No findings.
- **Head note:** the head is a merge commit, "Merge origin/main (800585c8) into antigravity/v1-deploy-audit-list-detail" — the PR is based on main 800585c8, and both CI and the local checks below are verified at c7ce9ef6.

## What it does

Repair #2a from `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md`:

- `v1/services/deploy/service.mjs`: version-scoped `/auditPage` list and detail contract — requires a valid `versionId` in the caller's school; returns numeric `total`, `versionId`, `archiveScope: "school-admin"`, and a stable `(recorded_at, event_id)` cursor with `limit + 1` lookahead; `detailId`/`eventId` lookup within the same school and version (`404 AUDIT_EVENT_NOT_FOUND` for unknown or foreign-version events); historical metadata shown with an explicit notice when before/after field values were not recorded.
- `scripts/v1/build-web.mjs`: labels the Admin display-cutoff button `Archive displayed audit (this Admin · school view)` with accurate non-destructive confirmation text.
- `tests/v1-product-deploy-audit-list-detail.mjs` (new): two versions, multi-page equal-timestamp pagination, detail lookup, unknown/foreign `404`, malformed cursor `400`, non-admin `403`, non-destructive archive preserving D1 rows, Chromium Audit tab UI (`Showing N of M events`, `Before / after` detail load, version switching).

## Scope and mergeability

- Diff against base 800585c8: exactly 4 files, matching the task record — `docs/coordination/tasks/v1-deploy-audit-list-detail.md`, `scripts/v1/build-web.mjs`, `tests/v1-product-deploy-audit-list-detail.mjs`, `v1/services/deploy/service.mjs`. 402 insertions, 8 deletions.
- `git merge-tree --write-tree --name-only origin/main c7ce9ef6` produced a clean tree (7b40c419) against current main (which now includes the #268, #271, #265 and #267 merges). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean after `npm run build`.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 45017290282, completed, success, head_sha c7ce9ef6d5337b01fa6298e059051e092cec54d4, attempt 1. It ran 31m38s — inside the 60-minute cap #274 raised it to.
- **Node/LORD ("Verify GSiS queue changes"):** absent — this is an `antigravity/**` branch and the workflow triggers only on `codex/**`, `muse/**` and `claude/**` branches. No waiver is hidden: under the owner's 20 Nov waiver ("review all done by antigravity, ignore difference in notation, i will orchestrate") and 21 Nov direction, this approval rests on green product CI at the exact head plus the full local verification below.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head c7ce9ef6. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-deploy-audit-list-detail.mjs` — PASS (version isolation, numeric total, equal-timestamp cursor pagination, detail lookup with 404 on unknown/foreign, non-destructive archive, Chromium UI).
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0 (380 artifacts, sourceCommit c7ce9ef6).
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the Deploy Audit list/detail contract, the archive label, one regression test, and the task record. Pass.
- Q02 (tests): the PR's regression test passes locally and in the product run at the head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or product behaviour change beyond the Audit contract repair. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): product CI green at the head; Node/LORD absent under the disclosed waiver (see CI above). Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the change, the verification, and the out-of-scope bounds. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Release notes

- The Deploy Audit page is now version-scoped with a stable cursor, correct detail lookup, and an accurate non-destructive archive label.
- No deployment authorised by this review.
