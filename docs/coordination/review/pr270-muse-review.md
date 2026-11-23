# Review of PR #270 — Resolve Sci/Science and PE/PHE aliases in v1 Deploy workload calculation

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #270, "Model: Antigravity / Resolve Sci/Science and PE/PHE aliases in v1 Deploy workload calculation". Branch `antigravity/v1-deploy-workload-sci-alias`. Head reviewed: `9501586c`.
- **Status at review:** OPEN, not a draft. Product CI green at the head. MERGEABLE/CLEAN (GitHub reports mergeable UNKNOWN transiently after main moved; `git merge-tree` below is clean).
- **Verdict: APPROVED at the exact head 9501586c.** No findings.
- **Head note:** the head is a merge commit, "Merge origin/main (800585c8) into antigravity/v1-deploy-workload-sci-alias" — the PR is based on main 800585c8, and both CI and the local checks below are verified at 9501586c.

## What it does

Repair from `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Deploy Workload `Sci` and `Science`):

- `v1/web/shared/deploy-loads.mjs` (new): pure derived helper `workloadAliasView(doc)` aligning stored load alias keys (`Science` → `Sci`, `PE` → `PHE`) with `shared/workload.js`'s `aliases()` without modifying v0.9 `shared/workload.js`, mutating saved Deploy rows, or double-counting planned demand. Handles exact canonical key, alternate spelling promotion, genuinely missing load (remains incomplete), and conflicting aliases on the same level (nulled so Workload flags incomplete rather than silently guessing).
- Wires `workloadAliasView` into both the Deploy Worker (`v1/services/deploy/model.mjs`) and the built Deploy browser adapter (`v1/web/shared/deploy-loads-ui.js`), preserving #259's version-owned planning basis.
- `tests/v1-product-deploy-workload-sci-alias.mjs` (new): alias match `Sci` → `Science`, exact `Sci` key, genuinely missing load, conflicting aliases refusal, non-mutating derived view.

## Scope and mergeability

- Diff against base 800585c8: exactly 5 files, matching the task record — `docs/coordination/tasks/v1-deploy-workload-sci-alias.md`, `tests/v1-product-deploy-workload-sci-alias.mjs`, `v1/services/deploy/model.mjs`, `v1/web/shared/deploy-loads-ui.js`, `v1/web/shared/deploy-loads.mjs`. 244 insertions, 4 deletions.
- `git merge-tree --write-tree --name-only origin/main 9501586c` produced a clean tree (2b2a730d) against current main (which now includes the #268, #271, #269, #265, #273, #267, #264 and #266 merges). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean after `npm run build`.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 45017309121, completed, success, head_sha 9501586cae48e0fddaade10ee739213798409b6d, attempt 1. It ran 33m22s — inside the 60-minute cap #274 raised it to.
- **Node/LORD ("Verify GSiS queue changes"):** absent — this is an `antigravity/**` branch and the workflow triggers only on `codex/**`, `muse/**` and `claude/**` branches. No waiver is hidden: under the owner's 20 Nov waiver ("review all done by antigravity, ignore difference in notation, i will orchestrate") and 21 Nov direction, this approval rests on green product CI at the exact head plus the full local verification below.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 9501586c. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-deploy-workload-sci-alias.mjs` — PASS (alias match, exact key, missing load, conflicting aliases refusal, level-wide group coverage, non-mutating derived view).
- `node tests/v1-product-deploy-workload-planning-browser.mjs` — PASS (#259 planning basis preserved: Stats and Ledger share the planning basis without inventing R; visible report workbook retains the basis; read-only browser reports leave owner documents, accepted relief and publication paths unchanged).
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0 (380 artifacts, sourceCommit 9501586c).
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the Deploy workload alias view, its two call sites, one regression test, and the task record. Pass.
- Q02 (tests): the PR's regression test and the #259 planning-basis test pass locally and in the product run at the head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or product behaviour change beyond the alias resolution. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): product CI green at the head; Node/LORD absent under the disclosed waiver (see CI above). Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the change, the verification, and the out-of-scope bounds. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Release notes

- Deploy workload now resolves Sci/Science and PE/PHE load aliases without mutating saved rows; conflicting aliases are flagged incomplete instead of silently guessed.
- No deployment authorised by this review.
