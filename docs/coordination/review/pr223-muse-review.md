# Review: PR #223 — Compact Deploy tables after successful loading

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `4893d416e0060ba638eb6f34eb72341e1774c652`.
- Branch: `codex/v1-deploy-compact-table-loading`. Base: `bd77b27d` (v1.06 label). PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Integrates the two previously approved table-presentation branches — Compact on load (35abe1b, record 8c2ece8f) and Layout and Teachers (cb4b347, record 4aacb02a) — onto v1.06, and adds the successful-Refresh path the owner reported on 19 November.

- Every Deploy table is fitted when a view opens or a foreground load is accepted: explicit Refresh (including same-data responses), saved-version loads, Audit reloads, and tab changes. Manual widths reset only on an accepted read; failed or declined reads, local sorting, and note drafts keep their state.
- The shared fitter (`core-table.js`, `compactAfterLoad`) waits for the current gesture or editing focus, skips schedule grids, and only clears widths when the row fingerprint (text plus input/select/textarea values, hidden and password inputs excluded) has changed, so sorting the same nodes never resets widths.
- Layout part: toolbar anchored before `.assignment-split`, native sort kept as the only sort for its column, dark first header, Teachers white/light-blue bands, Span of Control last in HR Settings.
- Screen-only compact padding (`suite.css`); print geometry untouched. Frontend and test changes only. No capability, authority, mutation, or data paths touched. No migration. Rollback restores the previous frontend assets.

## Port fidelity

- Layout test `tests/v1-product-deploy-layout-and-teachers-browser.mjs` is byte-identical to the approved branch cb4b347.
- Compact test `tests/v1-product-compact-on-load-browser.mjs` differs from the approved branch 35abe1b only in the disclosed Calendar Glossary assertion: it now waits for both manual inline widths to clear, then checks the automatic fit against the Compact button's fit for the same loaded rows (the previous head compared widths across different row sets and failed in CI).
- New test `tests/v1-product-deploy-compact-refresh-browser.mjs` covers the 35-view / 41-table matrix, manual widths, failed and identical-data Refresh, unsaved Versions notes, new version selection, Audit, and Duty spans.
- The integration note from the branch-head reviews is closed by this PR: layout and compact both change `v1/web/shared/core-table.js`, and this head carries the combined change with a clean merge tree.

## Scope, merge, secrets

- Diff vs origin/main: exactly 9 files, matching the task record's exact-path list (`docs/coordination/tasks/v1-deploy-compact-table-loading.md`, `v1/web/shared/core-table.js`, `module-shell.js`, `suite.css`, `deploy-ui.js`, `deploy-publication.js`, and the three test files). 810 insertions, 49 deletions.
- `git merge-tree --write-tree --name-only origin/main 4893d416` clean (tree bbb1041adfdda62a5905a05b3f88e833e1bdd235).
- Secrets scan of the diff: clean (only a CSS selector excluding password inputs from the fingerprint).
- Task record names Muse as reviewer on the combined exact head; the two source reviews are cited.

## CI at the exact head

- Node/LORD run 44413625905: success at head 4893d416 (all four shards + full-suite).
- Product run 44413625545 (branch push): success at head 4893d416.
- PR-triggered product run 44415760283: first attempt failed 135/136 — the only failing program was the unchanged `v1-product-stapler-resize.mjs`, killed at the 45s per-program ceiling (ETIMEDOUT, 45149 ms), with no failed assertion in the log. Same known timing flake as #214 and #218. The failed job was rerun; the rerun was still in progress when this record was written (08:25 SGT). The approval rests on the two green exact-head runs above plus the local pass of the flaked program.

## Local checks at the exact head (Singapore time, Playwright chromium-1234)

- `npm ci` root and `v1/`: exit 0.
- New tests PASS: `v1-product-compact-on-load-browser`, `v1-product-deploy-compact-refresh-browser`, `v1-product-deploy-layout-and-teachers-browser`.
- Regressions PASS: `v1-product-stapler-resize` (the CI-flaked program, passes locally), `v1-product-operation-probe`, `v1-product-v09-frontend-parity`.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs`: exit 0. `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q05 supported by the scoped inventory, the real owner-read signal, unchanged mutation/capability paths, local recovery checks, and bounded browser fitting. Q06 supported by exact-head CI above plus the local runs. Q07 is this review. Q08 is outside this task.
- Hosted runtime UAT: **Not tested**.
