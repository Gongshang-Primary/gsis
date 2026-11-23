# Review: PR #249 — Deploy Teachers row order, class suffix order, and Span of Control staff hydration (DEP-21-001, DEP-21-002, DEP-21-003)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `77fcb63`.
- Branch: `antigravity/v1-deploy-ordering-and-span-followup`. Base: main `6461f4e`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Three Deploy follow-ups, originally recorded by Codex, implemented by Antigravity:

- **DEP-21-001 — Teachers row order and grey inactive fill**: on load, rows order active HOD first, then active Junior KP, then remaining active teachers (by the version's effective EO appointment level / `GSISTeachingRules.group`), then unknown activity, then confirmed inactive at the bottom. Confirmed inactive rows get the `.inactive` class and grey fill (`#e4e7ea`); active and unknown-activity rows keep normal white/light-blue bands. Confirmed inactive stays pinned at the bottom in both directions of a header sort (core-table.js compares the inactive flag before applying the sort direction). The initial ordering only applies when no manual Teachers sort is active.
- **DEP-21-002 — Consistent class suffix order**: the same default suffix order in IP Deploy and Program Settings → Classes, reading the version's naming pattern before search or level filtering. Single-letter scheme: `P → T → I → R → C → H → G → K`. Two-letter scheme: `Gc → Gt → P → Rs → Rp → I → D → E → K` (owner's explicit `Rs` before `Rp`, recorded in the task). A new two-letter class name set is added to `v1/services/deploy/model.mjs` defaults; attached teaching groups stay with their class or venue blocks; custom/unranked suffixes keep a stable order.
- **DEP-21-003 — Span of Control staff hydration**: the Span candidate pool (`reportingStaff`) hydrates from both saved version `doc.teachers` and the version's Contacts reference (`staffCatalog`), without mutating `doc.teachers` on read. The catalog is attached as a non-enumerable `staffCatalog` property on reporting edits and Span exports/imports, and `reportingStaff` merges catalog entries except `removedTeachers`. Active School Leaders (SL), SAT, SAT × MK, Support and OSO present in Contacts populate Layer 1 roots and officer choices; MK-only, inactive and unknown-activity staff are excluded. Workbook validation accepts hydrated staff via `knownReportingStaff` (teacher map plus allowed IDs).

## Scope, merge, secrets

- Diff vs the PR base: exactly 10 files, matching the task record's exact-file allowlist (task record, two browser tests + deploy-storage test, `model.mjs`, `service.mjs`, `workbooks.mjs`, `core-table.js`, `deploy-eligibility.mjs`, `deploy-ui.js`). 678 insertions, 35 deletions.
- `git merge-tree --write-tree --name-only origin/main 77fcb63` clean (tree 90c20107); GitHub reports MERGEABLE/CLEAN.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).

## CI at the exact head

- Isolated v1 product run 44879198742: **success at head 77fcb63**. (The earlier run at 81a3ff7 failed on `v1-product-deploy-storage.mjs`; the builder fixed it with the one-line test change at 77fcb63.)
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt249-review` at 77fcb63, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-deploy-ordering-and-span-browser.mjs`: exit 0, PASS.
- `tests/v1-product-deploy-layout-and-teachers-browser.mjs`: exit 0, PASS.
- `tests/v1-product-deploy-planning-eligibility-browser.mjs`: exit 0, PASS.
- `tests/v1-product-deploy-planning-eligibility.mjs`: exit 0, PASS.
- `tests/v1-product-deploy-workbooks.mjs`: exit 0, PASS.
- `tests/v1-product-deploy-storage.mjs`: exit 0, PASS.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
