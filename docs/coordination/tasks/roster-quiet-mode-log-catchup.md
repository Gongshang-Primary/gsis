# roster-quiet-mode-log-catchup: catch up verbose logging after quiet mode ends (changelog)

- Status: implemented; verification and draft review in progress; merge held until owner release
- Owner/model: Codex
- Branch: codex/roster-quiet-mode-log-catchup
- Reviewer/model: Claude
- Lane: R (serial); applies to the Google (fallback) workflow, and must also hold on D1

## Owner request (verbatim)
"roster changelog for codex to Google (fallback) workflow: when quiet mode is turned off by "let teachers see", let verbose logging catch up with all the pent up logging (right now verbose logging is missing out details during quiet mode)"

## Context (Claude)
Quiet mode (`shared/roster-quiet-mode.js`) pauses `allocation`, `peer-mail` and `audit-export`. "Let teachers see" ends it (`QUIET_END_OPERATIONS.publish`). The allocation audit export ("verbose logging") runs at most one retained day per five-minute invocation (`notification-worker/index.js`, cron `2-57/5`), so decisions made during quiet mode appear to be coalesced or missed instead of recorded step by step.

## Requirement
1. While quiet, keep recording each SMC decision's audit facts durably (a cheap append, not the heavy export), so nothing is lost.
2. When quiet ends (publish, notifyDaily, expiry or manual end), drain the pent-up audit backlog in order, oldest first, until caught up; then resume the normal cadence.
3. The catch-up must not compete with the morning saves: bounded batches, and it yields while quiet is active again.
4. Same behaviour on D1 authority.

## Acceptance
Test: a quiet session with N decisions, then publish; the audit export afterwards contains all N in order with their times; nothing is duplicated on retry.

## Owner ruling (2 Nov ~06:05)
"Verbose logging" = the **allocation audit export** (the per-day Excel/Drive archive), job `audit-export`, which quiet mode pauses.

## Bounded implementation claim, 2 November 2026
Model: Codex. User explicitly requested this task after the cutover PR fixes/reviews. Base: main b0c30bedf1ad94e9ba35a8121707e94beb32586f. Scope: quiet-mode state/Worker audit scheduling, existing Google/D1 audit service boundary, focused tests and regenerated bundles. Retain each already-durable decision and original timestamp; reuse existing oldest-first exporter and immutable evidence/watermarks. Add a bounded, resumable catch-up after any quiet end, yielding again if quiet restarts. Verify all decisions and ordering on both authorities, retry without duplicates, lock/contention behavior and privacy. Full Node/LORD CI and Claude exact-head review before merge. No live records, messages, activation or deployment.

## Resumed 3 November 2026

Model: Codex. Owner explicitly resumed this task from current main `594c7e3f596ede054287232326d872550adb30cb`; the existing claim continues. Draft PR only, with merge held until after the cutover and owner release. Claude reviews the exact final head. Other held PRs and #58 are outside this task.

Saved SMC decisions already append essential before/after facts and their original timestamps in the authoritative transaction. Preserve that path; unsaved browser actions cannot be reconstructed. Reuse the existing pending export records and immutable archives as the durable backlog, without a second queue or new storage schema.

The dedicated five-minute audit lane will drain at most three one-day exports per invocation, with a 20-second budget for starting further work. It rechecks quiet mode before each export and stops on contention, notification priority, failure, disabled logging or no progress. A new quiet session pauses the next batch; any export already in flight can finish. The next existing audit invocation resumes oldest-first. The minute lane and its morning saves remain unchanged.

D1 currently returns a numeric export count and an exports array, whereas the shared dispatcher requires Google's array/count contract. Preserve the D1 fields, add an accurate pending count, and normalize both responses at the shared boundary. Retain existing Google text/JSON and D1 private R2 formats, original facts, receipt identities and authority fences.

Verification plan: exercise actual saved SMC decisions and both exporters through the real audit Worker lane; check all original timestamps, oldest-first bounded progress, all quiet-end conditions, resumed quiet mode, time/lock/notification limits, lost-response retry, concurrent changes, and private health summaries. Rebuild canonical outputs, run focused checks, then full Node/LORD CI at the published head. No deployment or live cutover.

## Implementation and local verification, 3 November 2026

Canonical changes are limited to `notification-worker/index.js`, `roster-update/public/_worker.js`, `roster-update/public/edge-roster.js` and the audit backlog explanation in `roster-update/public/system-health.js`. The existing build regenerates the notification and operations Worker bundles. #60's independent import-label restoration is not included.

The new real-Worker regression first failed because Google exported only one date and the dispatcher rejected D1 with `INVALID_RESPONSE`. It now proves three saved SMC choices retain their original IDs, before/after details and times on Google and D1; six pending dates drain in two bounded invocations. Publish, accepted WhatsApp request, manual end and expiry all resume export. A renewed quiet session, elapsed budget, writer contention, notification priority and an unconfirmed text write retain work for retry. D1 concurrent same-day changes reject the archive checkpoint; a newly changed date prevents a false caught-up result. A mutation removing that final-scan safeguard fails the corresponding regression.

`TZ=Asia/Singapore npm run build` passed for all 18 components. Nineteen focused audit, quiet-mode, Worker, D1 and UI programs passed. The pre-existing packaged audit test expected the previous one-call cadence; its fixture and assertions now verify three individually signed one-day calls, aggregate counters, unchanged recovery routing and no notification send. `TZ=Asia/Singapore python3 lord-suite/tests/run_all_checks.py` passed 39/39 programs. `git diff --check` passed. The full Node selection and full exact-head CI results are recorded in the PR before handoff; no unavailable check is counted as a pass.

The local checkout was materialized from verified GitHub blobs at main `594c7e3`; its baseline tree exactly matches `4d9f6d2c03c89bed71e8b7b8d2488631fb0b5425`. The local materialization commit is not a product change and is not published. The remote feature commit has the actual current main as its parent.

## Internal review corrections

An independent Codex review of local head `ea1297f` found that the pre-existing D1 exporter did not yield to pending notifications or honor disabled/suppressed optional logging. Both became acceptance gaps for this cross-authority catch-up. New failing regressions reproduced them before correction. D1 now checks current notification readiness and logging policy using bounded metadata queries, preserves essential SMC facts, and excludes previously suppressed intervals even after logging is re-enabled. Future notification retries do not block export.

The review also found that a slow quiet-mode read could cross the admission deadline. The explicit 20-second budget makes this a required correction: a failing regression now verifies the budget again after that read and before starting the export. All 21 catch-up cases pass after these fixes. Same-day and new-day concurrent-change guards, saved receipt identities and existing quiet-mode end rules remain unchanged. This internal review is not Claude approval; Claude still reviews the final published head.

## Full-suite midnight fixture correction

The first exact-head run, [41515530374](https://github.com/helper-gsps/gsis/actions/runs/41515530374), passed three shards. Its remaining shard failed `roster-cutover-freeze-queue.mjs` because the fixed 2 November report was now in the past. The identical failure reproduced on unchanged main `594c7e3`; changing only the fixture date to the current day made that baseline pass. The retained fix pins the service clock to the original fixture date and restores it in `finally`, leaving every freeze, receipt, queue and exactly-once assertion intact. This changes no production behavior. The final head receives a fresh complete run before the draft PR is opened.

## Release and rollback

Claude reviews the final published head. Keep the draft PR unmerged until after the cutover and explicit owner release. No live deployment, authority flag, settings, school record or provider message changed. Rolling back this PR restores the previous audit cadence and response handling; all saved audit facts, immutable archives and existing checkpoints remain retained.
