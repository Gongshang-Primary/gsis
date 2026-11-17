# Muse review — PR #206: restore Deploy Subject Load column order

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #206, branch `codex/v1-deploy-subject-load-order`, draft, not merged.
- Exact head reviewed: `3b4eeab4d09f52e8dd0a1b568f1f59e45f22c126`.
- Base: `066fcdda7a00242008938ad4aa67d14e83eab7fa`.
- Verdict: **APPROVED at the exact head.**

## What it fixes

Subject Load displayed its columns in stored order instead of the owner's sequence. This PR restores the order: Level → Assembly → FTGP → FTT → FORM, then EL → LSP → FEL → RRP → SDR → Math → LSM → FMA → CL → ML → TL → CCE → HCL → HML → HTL → MTSP → FCL → FML → FTL → Science → FSC → SS → PHE → Art → Music → PAL → CCE EL → E2K → PD.

## Scope verified

- Diff is exactly the three paths in the task record `docs/coordination/tasks/v1-deploy-subject-load-order.md`: the task record, `tests/v1-product-deploy-loads-browser.mjs`, `v1/web/shared/deploy-loads-ui.js`. 51 insertions, 6 deletions.
- `git merge-tree --write-tree --name-only origin/main 3b4eeab` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- Presentation change only. No Worker validation, workbook import/export contract, D1 data model, dependency, schema, permission or deployment workflow change. No migration. No live data change.

## Design read

- `deploy-loads-ui.js` gains a `subjectLoadOrder` list matching the owner's required sequence exactly, and a rank map looked up case-insensitively (`trim().toUpperCase()`), so stored codes such as "Math", "Science", "Art" and "Music" land on their positions.
- Sci and PE aliases take the Science and PHE ranks. Unknown/custom subjects get rank `subjectLoadOrder.length`, so they sort after every known subject and before PD (PD is appended after the teaching columns), and `Array.prototype.sort` is stable, so custom codes keep their relative order.
- Columns are `[...components (Assembly, FTGP, FTT), "FT", ...teachingColumns, "PD"]`, with Level rendered first. "FT" is displayed as the calculated FORM total, unchanged from #203.
- FORM still calculates Assembly + FTGP + FTT (that code is untouched). PD remains read-only at 2 periods per PLT. An in-use Legacy FORM remains a separate reference column, unchanged.
- The test seeds the full order in deliberately scrambled input and now asserts the exact headings with `assert.deepEqual` instead of the previous weaker `includes("FORM")` check. The legacy-FORM variant asserts `[...expectedHeadings, "Legacy FORM"]`. The assertion is stronger, not weaker; all existing save/reload, read-only PD, retained Legacy FORM and Excel import assertions are retained.

## CI verified at the exact head

- Node/LORD run 44177800505: head_sha verified `3b4eeab`, all five jobs green.
- Product/package run 44177808976: head_sha verified `3b4eeab`, success, full product suite, build, Worker verification and packaging passed.
- A duplicate product run 44180205193 was still pending at review time; it is not needed — the cited run above is success at the exact head.
- The task record states the new heading assertion failed on the old renderer and passed with the fix in a built Chromium browser using synthetic local Workers and D1. That negative control is builder-stated; the local run below re-verifies the passing state.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-deploy-loads-browser.mjs` — PASS.
- `node tests/v1-product-deploy-loads.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS, nine services, 373 artifacts.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (limits, as stated in the PR): hosted UAT remains Not tested. The runtime change is in the Deploy frontend only. No merge or deployment by this PR.
- N2: #203 and #204 have since merged (13aac2ad and 1c42db77) and were integrated for v1.05 (5aadad09, df7d298b). The #203/#204 build-web.mjs integration note from those reviews is therefore closed by that integration, not by this PR.

## Quality gates

- Q01: Pass. Owner-requested exact sequence recorded in the task record; owner instructed Codex to commit the logged changes.
- Q02: Pass. Presentation-only; pure renderer ordering, no new dependency, no schema or permission change.
- Q03: Pass. Save, capability, revision and recovery behaviour untouched and re-exercised by the browser regression.
- Q04: Pass. Save/reload and Excel import assertions pass locally and in CI.
- Q05: Pass. Bounded frontend route only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD and product CI green.
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is this bounded commit; no data/schema rollback is needed.
