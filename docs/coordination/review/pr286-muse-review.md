# Review: PR #286 — Explain unavailable Deploy relief quotas (Muse, exact head ea440b2b)

Project: v1. Reviewer: Muse, at the exact head SHA, under the owner's 16 Nov 2026 directive: Muse reviews v1 PRs at the exact head, replacing Claude until Claude returns; no code, merges or coordination. GPT merges.

## Verdict

**APPROVED at exact head `ea440b2b08d40f4c3ae25f6000b8c50fd5240a0c`.**

## PR

- #286, `codex/v1-deploy-relief-quota-reasons`, "Model: Codex / Explain unavailable Deploy relief quotas". Reviewer named: Muse at exact head `ea440b2b`. Merger: GPT.
- State at review: OPEN, not a draft, MERGEABLE/CLEAN. Merge-base `d0ff8f5d6e8386295af04a4beaf4318402cc321e` (the accepted claim commit); origin/main at review time `e3eb8a93`.
- Three commits on the merge-base: `d0ff8f5d` (claim), `3af0acb3`, `ea440b2b` ("Resolve overlapping quota refresh and save guidance").

## CI at the exact head

- "Isolated v1 product", run 45107933854, head `ea440b2b08d40f4c3ae25f6000b8c50fd5240a0c`, event pull_request, completed **success** (34m40s). Log tail: "192/192 product programs passed".
- "Verify GSiS queue changes", run 45107928321, head `ea440b2b08d40f4c3ae25f6000b8c50fd5240a0c`, completed **success**: full-suite pass, scope pass, regression shards skipping (v1-only change under the #280 scope rule). No waiver needed: this is a `codex/**` branch, so Node/LORD CI ran.

## Scope

Diff against the merge-base (`d0ff8f5d`): **4 files, 231 insertions, 2 deletions.** The file list matches the task record's exact scope.

| File | Change |
| --- | --- |
| `docs/coordination/tasks/v1-deploy-relief-quota-reasons.md` | +25/−1: diagnosis, change and verification sections |
| `scripts/v1/build-web.mjs` | +1/−1: include `deploy-relief-ui.js` in the built Deploy page |
| `tests/v1-product-deploy-relief-quota-browser.mjs` | +129, new: browser regression for quota explanations |
| `v1/web/shared/deploy-relief-ui.js` | +76, new: read-only quota diagnostics module |

- `git merge-tree` of merge-base, origin/main and `ea440b2b`: clean, no conflicts.
- `git diff --check` clean. Secrets scan of the diff: no secret values (no `secret`/`password`/key/token-value hits).
- The task record's evidence link (DEP-23-002/003 UAT log at blob `16a61d3f`) resolves: commit `16a61d3f` ("Record when Deploy Ledger relief quota should calculate") exists and contains `docs/v1/DEPLOY_STATS_UAT_2026-11-23.md`.

## Code verification (read, not trusted)

**New module (`v1/web/shared/deploy-relief-ui.js`, 76 lines).** Read-only display. It wraps `window.workloadReference` (Stats) and `window.workloadTeacherTable` (Ledger), both defined as classic-script globals in `public/workload-ui.js`, and reads the current version through `v()` (`public/app.js:226`). It computes no R and grants no eligibility: unavailable quotas are identified from Deploy's returned `reliefResults.teachers[].R`, with the reason taken from the row's own `reason` or from the accepted-eligibility evidence (`ACTIVITY_UNVERIFIED` / `EO_UNVERIFIED` / `SECTION_UNVERIFIED`) when the projection carries those codes.

- Pending projection → "Save changes to update relief quotas." Stale → "Refresh to update relief quotas." Both flags → Save takes precedence (the native refresh path leaves queued edits in place, so Refresh first would mislead). No projection → "Refresh to load relief quotas."
- The diagnostics list covers the version's applicable rows, not only the current table filter: the Stats wrapper passes all eligible active rows, the Ledger summary wrapper all rows with activity, totals or incompletes.
- `install()` no-ops if `window.workloadReference` or `window.workloadTeacherTable` is not a function, so a page without those globals is unaffected.

**Build inclusion (`scripts/v1/build-web.mjs`).** One-line change: appends `<script type="module" src="/v1/shared/deploy-relief-ui.js">` to the Deploy page's module list. Unlike #285, nothing here adds a top-level import to `deploy-ui.js`, so the tables-test harness path is unaffected.

**New test (`tests/v1-product-deploy-relief-quota-browser.mjs`, 129 lines).** Synthetic fixture via real local Workers/D1: two teachers, one with accepted EO evidence (R = 47), one without (R null). Asserts Ledger shows 47 / "Unavailable" and Stats withholds the average, with the diagnostics naming only teacher B and the missing accepted EO evidence; all three pending/stale flag combinations; then accepting B's EO evidence through Contacts recalculates R to 0, the complete group average to 23.5, Ledger and Relief Settings show 0, diagnostics disappear, and the saved version document is byte-identical afterwards. No browser errors.

**Baseline check (mine, not the builder's).** The new test copied into a worktree at the merge-base `d0ff8f5d` fails with a Playwright `TimeoutError` waiting for `[data-relief-quota-diagnostics]` — the test genuinely exercises the new module and is not vacuous.

## Local verification at the exact head

Worktree `~/workspace/gsis-work/review/wt286-review` at `ea440b2b`. TZ=Asia/Singapore, GSIS_BROWSER_EXECUTABLE = Playwright chromium-1234 (`/home/hatch/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`).

- `npm ci` (root): exit 0. `npm ci` (v1/): exit 0.
- `npm run build`: exit 0, 18 production components, zero tracked drift (`git status` clean).
- `node scripts/v1/build.mjs`: exit 0 (9 services, 381 artifacts, `sourceCommit ea440b2b08d40f4c3ae25f6000b8c50fd5240a0c`).
- `node scripts/v1/verify-build.mjs`: exit 0.
- Product tests, each exit 0, run sequentially:
  - `tests/v1-product-deploy-relief-quota-browser.mjs` — exit 0 ("PASS Deploy quota explanations and complete R via browser, Contacts, Deploy Worker and D1")
  - `tests/v1-product-deploy-workload-planning-browser.mjs` — exit 0, four groups
  - `tests/v1-product-deploy-saved-teacher-membership.mjs` — exit 0, 5/5 groups (#212 regression)

## Notes

- Minor, not a finding: `quotaDiagnostics` builds its evidence map from `doc.teachers` without a guard, so a version document with no `teachers` array would throw inside the wrapped renderers. A version document always carries `teachers`, and the wrapped renderers already assume rows exist; no change required.
- Open item, disclosed in the task record and not a finding: the exact cause on the hosted version that produced the owner's screenshot remains unverified — hosted reproduction needs the same saved version/revision and its actual Deploy result. No live records were read or changed.

## Outcome

APPROVED at the exact head. GPT to merge. No deployment authorised. F5 remains OPEN.
