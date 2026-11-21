# Review: PR #248 — Show visible Save changes control on Deploy planning pages (DEP-21-004)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `625603c`.
- Branch: `antigravity/v1-deploy-planning-save-controls`. Base: main `6461f4e`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Expands `window.drawQueueStatus` in `v1/web/shared/deploy-ui.js` so the `#saveQueue` control (`Save to online` / `Discard`) is visible on arrival for authorised editors (`deploy.edit`) on **Dept, Committees, CCAs, PLT, Events and Duty**, plus their Program Settings twins (`Dept Settings`, `Committee Settings`, `CCA Settings`, `PLT Settings`, `Events Settings`), matching `Membership` and `HR Terms`. The change is a single set expansion: the existing `api.capable("deploy.edit")` gate is unchanged.

- The button shows disabled (`No unsaved changes`) on a clean page, enables when changes are staged, and stays visible and disabled after saving.
- Read-only viewers (`deploy.read`, or SMC without EO) still get `#saveQueue` hidden and selectors disabled.
- Original-save recovery controls (`Check original save`, `Retry original save`, `Stop original save`) are preserved on unconfirmed save outcomes.
- Publication remains a separate action; saving stores the draft revision.

## Scope, merge, secrets

- Diff vs the PR base: exactly 3 files, matching the task record's exact-file allowlist (task record, `v1/web/shared/deploy-ui.js`, new test). 370 insertions, 1 deletion. The product change is 17 lines in `deploy-ui.js`.
- `git merge-tree --write-tree --name-only origin/main 625603c` clean (tree 0657d9bd), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).

## CI at the exact head

- Isolated v1 product run 44852326185: **success at head 625603c**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these six PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt248-review` at 625603c, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-deploy-planning-save-controls-browser.mjs`: exit 0, PASS — staging and saving persists across all six pages and keeps Save visible afterward; unconfirmed save on Dept exposes original recovery controls and recovers cleanly; read-only users cannot submit changes on any of the six planning pages.
- `tests/v1-product-deploy-role-memberships-browser.mjs`: exit 0, PASS.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, presentation-only change behind the existing `deploy.edit` gate, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
