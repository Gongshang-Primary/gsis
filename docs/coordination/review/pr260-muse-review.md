# Review of PR #260 — Port #245/#247 readable review labels and pre-dispatch refusal regression

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #260, "v1(deploy): port #245/#247 readable review labels and pre-dispatch refusal regression". Branch `antigravity/v1-deploy-save-recovery-lessons-and-labels`. Base 15fb5ee. Head reviewed: `b3f7be04`.
- **Status at review:** OPEN, not a draft. Product CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head b3f7be04.** No findings.

## What it does

Ports the actionable v1 items from Codex's audit PR #245 and the v0.9 hotfix PR #247 into v1, without touching v0.9 `public/` files or Codex's draft branches.

- **Readable assignment-review labels** (`v1/web/shared/deploy-ui.js`, +59 lines, pure addition): wraps `window.resolveQueue` so that, when a review dialog is open, `addTeacher` / `removeTeacher` sections show human-readable headings — "Assign/Remove <Teacher> to/from <Class/TG> · <Subject>" — and values "Assigned" / "Not assigned" instead of raw assignment keys and booleans. `addTG` shows "Add teaching group <name>". Unknown teachers, classes, or subjects fall back to explicit "Unavailable …" wording rather than raw IDs.
- The wrapper yields cleanly if the native `draftReviewTitle` is already present (i.e. once #247 merges): it only installs when `typeof window.draftReviewTitle !== "function"`. All label writes use `textContent`, so teacher/class names cannot inject markup.
- **Regression handoff from #245** (`tests/v1-product-deploy-save-recovery-browser.mjs`, 116 lines): Scenario 1 — pre-dispatch refusal on fresh Deploy edits keeps all new edits editable, clears `queueFlight`, creates no phantom pending entry, and sends zero `/lease` or `/change` requests. Scenario 6 — review of queued `addTeacher` / `removeTeacher` edits shows escaped human-readable labels and "Assigned" / "Not assigned" wording rather than raw opaque IDs or `true`/`false`.

No Worker, D1, migration, authority, or deployment change. Browser UI wording and one browser regression only.

## Scope and mergeability

- Diff against base 15fb5ee: exactly 3 files, matching the task record's Files Claimed — `docs/coordination/tasks/v1-deploy-save-recovery-lessons-and-labels.md`, `v1/web/shared/deploy-ui.js`, `tests/v1-product-deploy-save-recovery-browser.mjs`. 202 insertions, 0 deletions.
- `git merge-tree --write-tree --name-only origin/main b3f7be0` produced a clean tree (5ab52c0f). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no secret, password, API-key, or private-key matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean. No `public/` file is touched.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 44900892897, completed, success, head_sha b3f7be0.
- **Node/LORD ("Verify GSiS queue changes"):** did not run for this head. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, and this is an `antigravity/**` branch. This is the same trigger gap as the earlier Antigravity PRs. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and directed review of the Antigravity queue again on 21 Nov, including directing this review. The approval therefore rests on green product CI at the exact head plus the full local verification below. The waiver is recorded here, not hidden.

## Local verification (21 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head b3f7be0. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-deploy-save-recovery-browser.mjs` — exit 0. All 17 groups pass, including queue retention after unverified HTTP denial, committed-save recovery after response loss without duplicate write, version-note locking, and shared-client cleanup preserving Contacts endpoint recovery.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to Deploy review-label wording in v1 and one browser regression. Pass.
- Q02 (tests): the new browser test covers both #245 handoff scenarios (pre-dispatch refusal and readable escaped labels). Pass.
- Q03 (no live change): browser-only; no Worker, D1, migration, or deployment change. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): the changed browser test passes with all 17 groups. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record names the source PRs, the exact scope, and the verification. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Findings

None.

## Release notes

- Deploy assignment review now shows readable labels ("Assign <Teacher> to <Class/TG> · <Subject>", "Assigned" / "Not assigned") instead of raw keys and booleans. The wording defers to the native implementation once #247 merges.
- Pre-dispatch refusal keeps fresh Deploy edits editable with no phantom pending operations and no stray lease/change requests.
- Hosted UAT is Not tested. No deployment authorised by this review.
