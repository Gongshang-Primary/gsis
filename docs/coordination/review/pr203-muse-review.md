# Muse review — PR #203: fix Deploy Subject Load, LSP and FORM saves

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #203, branch `codex/v1-deploy-loads`, draft, not merged.
- Exact head reviewed: `8ef3cd319ff070afcd3bcc951f162e9c05e5e4ff`.
- Base / merge-base: `2a568d1475dfc11ce69d59d98d03c504e84f989b` (accepted claim clarification).
- Verdict: **APPROVED at the exact head.**

## What it fixes

Deploy showed editable n/a subject cells that its owner Worker rejected because a per-level key was absent. This blocked sparse LSP and related Subject Load/Fortnight saves. The editor and Excel also disagreed about n/a, blank and zero; PD was editable despite being reference-only, while FORM duplicated the existing FT aggregate.

The fix is one pure v1 policy module, `v1/web/shared/deploy-loads.mjs`, now serving the owner Worker, the editor and the workbook adapter. Known standard/global subject cells save even when previously absent. Null/not-offered, offered-zero and finite half periods remain distinct; equivalent legacy values compare consistently. Only explicitly edited fields change. Native identity, current capability, school, revision/fence, operation identity, atomic import and receipt/recovery checks remain. No read-time data migration or assignment rewrite.

## Scope verified

- Diff is exactly the ten paths in the task record `docs/coordination/tasks/v1-deploy-loads.md`: the task record, `docs/v1/DEPLOY_SUBJECT_LOAD_UAT_2026-11-17.md`, `scripts/v1/build-web.mjs`, `tests/v1-product-deploy-loads.mjs`, `tests/v1-product-deploy-loads-browser.mjs`, `tests/v1-product-table-deploy-settings.mjs`, `v1/services/deploy/model.mjs`, `v1/web/shared/deploy-loads-ui.js`, `v1/web/shared/deploy-loads.mjs`, `v1/web/shared/deploy-ui-tables.js`. 750 insertions, 96 deletions.
- `git merge-tree --write-tree --name-only origin/main 8ef3cd3` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No v0.9 source, dependency, schema, permission or deployment workflow change. No migration. No live data change.

## Design read

- `deploy-loads.mjs` is pure: `parseLoad` (null, n/a, `(n/a)` and blank mean not offered; numbers 0–100 in half periods), `storedLoad` (unknown historical input stays visible for correction, never zeroed), `knownLoadSubject` (standard subjects or subjects already present in some level row), `planningView` (derived view only; saves still compare and update raw owning rows), `loadRows`, `parseSplit`/`storedSplit`, `fortnightRows` (mirrors the existing visible teaching-row policy, including TG-only codes).
- `model.mjs` `setLoad`: rejects reference subjects FT/FORM/PD/TTT with 400 REFERENCE_ONLY; requires an existing level row and a known load subject, so a known standard/global cell saves even when its key was absent; requires an explicit `value` (omitted fields never clear stored data); parses through the shared `parseLoad`; the expected-value check compares the current value against `storedLoad(expected)`, so supported legacy representations compare equal. `addSubject` validates through `validSubject` and rejects reference subjects. `setFortnight` validates the row JSON shape, requires an explicit value, parses through `parseSplit` (no boolean-to-number or blank-to-zero coercion), and compares expected values through `storedSplit`.
- New versions get all standard subjects as null in defaults and no second standalone FORM subject (the old `FORM: 0` default is removed). `calculate` and `setSubjectType` run against the derived `planningView`. Actual legacy FORM records remain separate, visible for review when relevant, and unchanged; standalone historical FORM assignments/TGs are retained rather than guessed into FT.
- `deploy-loads-ui.js` is a v1-owned editor in the v0.9 table/keyboard pattern: FT is shown as the calculated FORM total (Assembly + FTGP + FTT), PD is read-only at 2 periods per PLT, legacy FORM is a separate read-only cell with a review notice.
- `deploy-ui-tables.js` now imports the shared policy: Loads rows from `loadRows`, Fortnight rows from `fortnightRows`, per-cell `parseLoad`/`parseSplit` with location-tagged errors, expected values via `storedLoad`/`storedSplit`, and formatting-only changes do not consume the 32 changed-row budget.
- `scripts/v1/build-web.mjs`: one line only — the Deploy page now loads `deploy-loads-ui.js` as a module and `deploy-ui-tables.js` as a module (it was a classic defer script). Builder changes only script inclusion/types; no new business-logic text patch.

## CI verified at the exact head

- Node/LORD run 44056411197: head_sha verified `8ef3cd3`, all five jobs green, 1,227/1,227 Node programs, 40/40 LORD per shard.
- Product/package run 44056410637: head_sha verified `8ef3cd3`, success, 126/126 programs, canonical no-drift build, nine Worker dry runs/local migration upgrade and packaging passed. Duplicate product run 44060054197 also success at the exact head.
- Earlier CI is disclosed in the PR body and task record, not hidden: at prior product-identical head `9d175e0`, Node run 44053547444 passed 1,226/1,227 — only `v1-product-table-deploy-settings.mjs` failed because it injected the now-ESM adapter as a classic script. The accepted claim clarification 2a568d1 added that fixture to scope; both fixture pages now serve the unchanged module and its real dependency as browser modules on intercepted synthetic origins, retaining every existing assertion. No production code changed for that correction, and the final exact-head runs above are green.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root, then `npm ci` inside `v1/` before verify-build (see Note N1).

- `node tests/v1-product-deploy-loads.mjs` — PASS.
- `node tests/v1-product-deploy-loads-browser.mjs` — PASS.
- `node tests/v1-product-table-deploy-settings.mjs` — PASS.
- `node tests/v1-product-deploy-storage.mjs` — PASS.
- `node tests/v1-product-deploy-workbooks.mjs` — PASS.
- `node tests/v1-product-deploy-fortnight-browser.mjs` — PASS.
- `node tests/v1-product-deploy-save-recovery-browser.mjs` — PASS.
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS, nine service/web bundles.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (test setup, not blocking): verify-build first failed only because `v1/` needed its own `npm ci` (wrangler devDependency); passed after. Same as the #188 N1.
- N2 (integration, not blocking this PR): PR #204 (Span population and planning staff eligibility) is a sibling that also edits the same Deploy script-inclusion line in `scripts/v1/build-web.mjs` — #203 makes `deploy-ui-tables.js` a module and adds `deploy-loads-ui.js`; #204 makes `deploy-ui.js` a module. Both PR bodies disclose this. When the first of the two merges, the second needs a bounded integration update combining both module includes, with a build/browser recheck at its new exact head. Neither PR contains the other's product code, and each is self-consistent at its own head.
- N3 (limits, as stated in the PR): standalone historical FORM assignments/TGs are retained rather than guessed into FT; any conversion/retirement needs its own scoped decision. Real hosted publication, Drive backup execution, hosted restore, N-1 latency and authenticated UAT were not run. F5 remains OPEN; T1B-01/T1B-02 Not tested. No merge or deployment by this PR; current live v1.04 is unchanged.

## Quality gates

- Q01: Pass. Owner instruction recorded ("commit code changes" after the investigation); exact scope in the task record.
- Q02: Pass. Pure shared policy, no new dependency, no schema or permission change; authority/capacity/recovery owners untouched.
- Q03: Pass. Capability, school, revision/fence, operation-identity and atomic-import checks retained and exercised by the new tests.
- Q04: Pass. Atomic mixed rejection, exact retry/changed-intent denial, receipt/recovery checks exercised locally and in CI.
- Q05: Pass. Bounded owner routes and payload limits reused; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD and product CI green.
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback must preserve saved rows, immutable publications, frontiers and recovery receipts.
