# Review of PR #266 — Capture bounded before/after and labels on Deploy audit saves

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #266, "Model: Antigravity / Capture bounded before/after and labels on Deploy audit saves". Branch `antigravity/v1-deploy-audit-change-capture`. Head reviewed: `e6004bd2`.
- **Status at review:** OPEN, not a draft. Product CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head e6004bd2.** No findings.
- **Head note:** the PR body names the earlier head `e517704b` as the reviewed head. That head was superseded: the branch merged origin/main (800585c8) and the current head is e6004bd2, a merge commit. This review is at e6004bd2, and both CI and the local checks below are verified at e6004bd2.

## What it does

Repair from `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (First repairs #2, change capture):

- `v1/services/deploy/service.mjs`: records a bounded operation summary (`operationLabel`, `actorLabel` from the verified principal email, `editCount`, `operations`, `before`, `after`, `capturedChanges`, `omittedChanges`, `truncated`) atomically in `product_audit.details_json` inside `save()` → `finish()` → `commitOperation()`. Preserves `event_id`, `operationId`, `originalActor` (`actor_id`), `capabilityAction`, `versionId`, `scope`, `changedRows`, `previewId`, and all historical audit rows untouched. Bounds audit change capture to at most 20 entries and 12 KiB per event.
- `tests/v1-product-deploy-audit-change-capture.mjs` (new): single Subject Load change, multi-edit save, 1 event on idempotent retry, 0 events on 409/400 rejected writes, readable actor/operation labels, preserved originalActor/eventId/operationId and historical rows.

## Scope and mergeability

- Diff against base 800585c8: exactly 3 files, matching the task record — `docs/coordination/tasks/v1-deploy-audit-change-capture.md`, `tests/v1-product-deploy-audit-change-capture.mjs`, `v1/services/deploy/service.mjs`. 467 insertions, 6 deletions.
- `git merge-tree --write-tree --name-only origin/main e6004bd2` produced a clean tree (0c109c8e) against current main (which now includes the #268, #271, #265, #267, #264 and #273 merges). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean after `npm run build`.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 45017296083, completed, success, head_sha e6004bd249f5051ca944c29c35846a7533fe0a65, attempt 1. It ran 24m59s — inside the 60-minute cap #274 raised it to.
- **Node/LORD ("Verify GSiS queue changes"):** absent — this is an `antigravity/**` branch and the workflow triggers only on `codex/**`, `muse/**` and `claude/**` branches. No waiver is hidden: under the owner's 20 Nov waiver ("review all done by antigravity, ignore difference in notation, i will orchestrate") and 21 Nov direction, this approval rests on green product CI at the exact head plus the full local verification below.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head e6004bd2. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-deploy-audit-change-capture.mjs` — PASS (single Subject Load, multi-edit batch, idempotent retry 1 event, rejected writes 0 events, readable actor/operation labels, preserved originalActor/eventId/operationId and historical rows).
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0 (380 artifacts, sourceCommit e6004bd2).
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the Deploy audit change capture, one regression test, and the task record. Pass.
- Q02 (tests): the PR's regression test passes locally and in the product run at the head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or product behaviour change beyond the bounded audit capture. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): product CI green at the head; Node/LORD absent under the disclosed waiver (see CI above). Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the change, the verification, and the out-of-scope bounds. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Release notes

- Deploy audit saves now record a bounded before/after summary with readable actor and operation labels, capped at 20 entries and 12 KiB per event.
- No deployment authorised by this review.
