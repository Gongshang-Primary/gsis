# Review: PR #250 — IP Deploy collaborator orange cell presence and duplicate FT/class red conflict styling (UI03, UI01, UR03, D08, D09)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `c1652c4`.
- Branch: `antigravity/v1-deploy-cell-presence-and-conflict-styling`. Base: main `6461f4e`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Two IP Deploy features:

- **UI03 / D08 / TV07 — Concurrent cell editing and orange collaborator presence**: acquires, renews (25-second heartbeat), and releases cell-scoped leases (`<versionId>|cell:<rowId>:<subject>` and `<versionId>|cell:<rowId>:row-name`) when opening/closing `chooseTeacher` or `renameClass`. A new `/leases` read route and `clientId` in active lease responses let concurrent editors see active collaborator cells via live background polling every 2 seconds (`connectLive`). Any IP Deploy cell (`td[data-cell]` or `td.row-name`) actively leased by another editor/session gets an orange outline and translucent orange tint (`.gsis-cell-collaborator`), actor identity on hover (`title` / `data-collaborator-actor`), and a cell lock against concurrent editing while held. Lease release is epoch-guarded so a stale grant is released rather than kept, and leases release on `pagehide` and when live polling stops.
- **UI01 / UR03 / D09 — Nonblocking live duplicate FT and duplicate class validation**: temporary duplicate Form Teacher assignments and temporary duplicate class renames are permitted in the local draft without blocking input or displacing the existing class into `(undefined)`, while Save to online is blocked until resolved (via the `classRenameError` override). Every FT cell containing a duplicated FT teacher and every duplicate/undefined class-name cell gets a thick red outline and subtle red tint (`.gsis-cell-error`) with a contextual explanation; within affected FT cells only the duplicated teacher name(s) render in red text (`.gsis-chip-duplicate-ft`) while unaffected co-FT names keep normal styling. A cell with both a red error and an orange collaborator lock keeps both indicators (red outline plus orange inset shadow) and both tooltip/accessible messages.

## Scope, merge, secrets

- Diff vs the PR base: exactly 4 files, matching the task record's exact-file allowlist (task record, new browser test, `v1/services/deploy/service.mjs`, `v1/web/shared/deploy-ui.js`). 777 insertions, 1 deletion.
- `git merge-tree --write-tree --name-only origin/main c1652c4` clean (tree 5d6c5c2b); GitHub reports MERGEABLE/CLEAN.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).

## CI at the exact head

- Isolated v1 product run 44879967629: **success at head c1652c4**. (The earlier run at a57d538 failed on `v1-product-contacts-projection-browser.mjs` and `v1-product-deploy-planning-eligibility-browser.mjs`, plus a contacts-classification timing flake; the builder fixed it with the head commit, which renders `chooseTeacher` synchronously and makes cell lease release race-safe.)
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt250-review` at c1652c4, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-deploy-cell-presence-browser.mjs`: exit 0, PASS.
- `tests/v1-product-deploy-layout-and-teachers-browser.mjs`: exit 0, PASS.
- `tests/v1-product-deploy-storage.mjs`: exit 0, PASS.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
