# Re-review: PR #230 — Remove replaced Contacts, OVERLORD and Calendar legacy callers

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `2b165f67`.
- Branch: `antigravity/v1-probe-replaced-cleanup`. Base: main `559f5f51`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.
- This is a re-review at a rebased head. The original approval at `642a9643` (record `pr230-muse-review.md`) does not carry across the rebase; this record is the approval for the new head.

## Why a re-review

GPT merged #231, #232, #234, #236, #238, #239, #240 and #241 after the original approval, and #230 conflicted with the new main in `tests/v1-product/operation-probe-allowlist.json`. The owner directed conflict resolution and a fresh exact-head review. The rebase was performed by Muse (the reviewer) at the owner's direction, because the conflict was a purely mechanical union with a unique correct resolution — no product decision was involved. The resolution is disclosed here, and this approval rests on the fresh exact-head evidence below (green product CI at the new head plus full local verification), not on the rebase itself.

## What the rebase changed

The branch was rebased onto main `559f5f51`. The only conflict was the allowlist, one region at the head of the `entries` array. Both sides had removed different entries from the same region: #230 removed seven (calendar `/calendar-changes`, `/calendar-changes/delta`, `/calendar-jobs` (F14), contacts `/kp` (S2/replaced), lord `/transaction` backgroundack/backgroundapply/backgroundpreview (S2/replaced)); the merged PRs had removed six (deploy `/commands`, `/layout-reference` (F12), lord `/auth/relief` (F15), roster `/operations` contactCreate (F03), resolveAbsenceIntake/retryAbsenceIntake (F06)). Resolution keeps the union of both removals: all thirteen entries are gone, 11 remain.

Verified after the rebase: the diff vs the new main is exactly #230's original change (5 files, 244 insertions, 69 deletions). The allowlist entry set equals base minus main's removals minus #230's removals, and the `dynamicCallSites` set satisfies the same union rule (13 entries: base 15 minus #230's two removed calendar pins), with nothing missing or extra.

## What it does (unchanged from the original approval)

Removes seven dead/replaced v0.9-only API callers from built v1 frontend assets, without touching v0.9 source files:

- New `scripts/v1/remove-obsolete-callers.mjs`: three marker-based block replacements, each preserving exact line counts (`padPreservingLines` throws if the replacement is longer; `replaceBlock` throws if the baseline markers moved) and each asserting the legacy caller is gone afterward.
- Contacts: the legacy `roleForm` `/api/kp` submission becomes a redirect to Core Admin (`/admin/`).
- OVERLORD: dead `previewBackgroundWork` / `applyBackgroundWork` / `acknowledgeBackgroundHistory` (`backgroundpreview` / `backgroundapply` / `backgroundack`) become calls to `window.GSISV1LordBackground.open()`.
- Calendar: the flag-disabled job-queue (`/calendar-jobs`) and DO push-stream (`/calendar-changes`, `/calendar-changes/delta`) callers are replaced with stubs (`enqueueCalendarJob` throws explaining v1 saves directly; `loadCalendarJobs` returns []; `renderCalendarJobs` removes the panel; stream functions are no-ops).
- The operation-probe allowlist loses the seven entries plus the two dead `calendar/app.js` dynamic call-site pins (lines 6674, 6684).

## Scope, merge, secrets

- Diff vs origin/main: exactly 5 files, matching the task record's exact-file allowlist (task record, new remove-obsolete-callers.mjs, build-web.mjs, operation-probe-allowlist.json, new obsolete-callers test). 244 insertions, 69 deletions.
- `git merge-tree --write-tree --name-only origin/main 2b165f67` clean (tree eda116aa), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.

## CI at the exact head

- Isolated v1 product run 44694996871: **success at head 2b165f6**, after a rerun. The first run failed on a single timing flake: `v1-product-deploy-planning-eligibility-browser.mjs` hit a `page.waitForFunction` 7s timeout at line 368 with no failed assertion (160/161 programs passed). That test passes locally at this exact head, and the rerun passed the full suite. The flake is recorded here, not hidden.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt230-rebase` at 2b165f67, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-obsolete-callers.mjs`: exit 0, PASS — removal helpers throw on changed baselines; built assets contain no legacy callers; line-count parity on unmodified v0.9 sources; native Calendar `saveYear` + `saveEvent` pass.
- `tests/v1-product-operation-probe.mjs`: exit 0, PASS — 399 probes, `knownMissing` 11 (the union count on this base: 24 − 6 cleared by merged PRs − 7 cleared here), parsedScripts 131, `unresolvedDynamic` 13.
- `tests/v1-product-web-browser.mjs`: exit 0, PASS on rerun (nine built module screens). First local run failed on a transient breadcrumb timing race (`0 !== 1` on the compact-breadcrumb count, no failed assertion); the rerun passed cleanly.
- `tests/v1-product-deploy-planning-eligibility-browser.mjs`: exit 0, PASS — run locally to check the CI flake above; all assertions pass at this head.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, fail-closed removals, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
