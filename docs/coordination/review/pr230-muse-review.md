# Review: PR #230 — Remove replaced Contacts, OVERLORD and Calendar legacy callers

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `642a964331eedc8b32bff059ccc0a6a0f866f272`.
- Branch: `antigravity/v1-probe-replaced-cleanup`. Base: main `7ee24189`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Removes seven dead/replaced v0.9-only API callers from built v1 frontend assets, without touching v0.9 source files:

- New `scripts/v1/remove-obsolete-callers.mjs`: three marker-based block replacements, each preserving exact line counts (`padPreservingLines` throws if the replacement is longer; `replaceBlock` throws if the baseline markers moved) and each asserting the legacy caller is gone afterward.
- Contacts: the legacy `roleForm` `/api/kp` submission becomes a redirect to Core Admin (`/admin/`).
- OVERLORD: dead `previewBackgroundWork` / `applyBackgroundWork` / `acknowledgeBackgroundHistory` (`backgroundpreview` / `backgroundapply` / `backgroundack`) become calls to `window.GSISV1LordBackground.open()`.
- Calendar: the flag-disabled job-queue (`/calendar-jobs`) and DO push-stream (`/calendar-changes`, `/calendar-changes/delta`) callers are replaced with stubs (`enqueueCalendarJob` throws explaining v1 saves directly; `loadCalendarJobs` returns []; `renderCalendarJobs` removes the panel; stream functions are no-ops).
- The operation-probe allowlist loses the seven entries plus the two dead `calendar/app.js` dynamic call-site pins (lines 6674, 6684).

## Scope, merge, secrets

- Diff vs origin/main: exactly 5 files, matching the task record's exact-file allowlist (task record, new remove-obsolete-callers.mjs, build-web.mjs, operation-probe-allowlist.json, new obsolete-callers test). 244 insertions, 69 deletions.
- `git merge-tree --write-tree --name-only origin/main 642a9643` clean (tree 205a7c3b), re-checked against current main c318d141.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- Pair merge-tree with #231 (99f445d4): clean (tree bd0e3084), no conflicts.
- The allowlist diff removes only the claimed entries (F14 calendar-jobs/changes/delta, S2/replaced contacts /kp, S2/replaced lord backgroundpreview/apply/ack) and the two dead dynamic pins.

## CI at the exact head

- Isolated v1 product run 44614859884: **success at head 642a964**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt230-review` at 642a9643, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-obsolete-callers.mjs`: exit 0, PASS — removal helpers throw on changed baselines; built assets contain no legacy callers; line-count parity on unmodified v0.9 sources; native Calendar `saveYear` + `saveEvent` pass.
- `tests/v1-product-operation-probe.mjs`: exit 0 — 400 probes, `knownMissing` 17 (was 24), `unresolvedDynamic` 13 (was 15).
- `tests/v1-product-web-browser.mjs`: exit 0, PASS (nine built module screens).
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, fail-closed removals, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
