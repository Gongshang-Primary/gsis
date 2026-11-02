# roster-backup-worker-throughput: R3 Worker-only backup and full-copy timing

- Status: verifying
- Model: Codex
- Reviewer: Claude, exact final head
- Branch: codex/roster-backup-worker-throughput
- Base: R7 d188803e7407b7863192510a50124440898f8e05
- Scope: Pages Update backup queues a dedicated Worker wake and returns status without capturing a generation or acquiring its lease. Increase bounded Worker transfer budget and page size. Prove a full 13.5k-item copy with the real D1 mirror core and Google adapter under an explicit latency envelope.
- Owned files: edge-roster.js, edge-roster-mirror.js, _worker.js, notification-worker/index.js, shared/edge-setup.js, focused tests and generated bundles.
- Out of scope: production deployment, live backup, switch-back execution, authority changes or message delivery.

## Plan
Reuse the existing mirror outbox, generation leases and immutable page receipts. A dedicated backup wake runs only the backup, with cron as fallback. Raise pages within Google's existing 500-item/4 MiB limits and Worker bounds. Test the actual Pages route without any mirror I/O; use the real core and Apps Script VM for a 13.5k-item full-copy timing regression. Keep timing assumptions explicit.

## Verification
Both new regressions failed before the fix. Build and focused checks now pass. Actual Pages Update backup makes zero Google mirror calls and captures no generation or lease; the signed dedicated Queue wake executes only backup work. Cron remains the fallback. The real core and Apps Script VM complete a 12,206,531-byte source with 13,500 audit rows in 49 Google calls and 6 Worker runs: 21 minutes 20 seconds with an injected 20 seconds per Google call and 60 seconds between runs. Exact native rows and uncertain provider evidence survive. This is a tested latency envelope, not measured production Google timing. Full CI pending. The updated local workerd/D1 resource probe failed with an Undici ECONNRESET; a minimal independent D1 SELECT probe also stalls here, while a minimal Worker HTTP request succeeds. Resource certification is not claimed from this environment. The source-sized real-core/Apps-Script timing regression and ordinary integrations pass. No live changes.

## Rebase after R1 merged, 2 November 2026
Model: Codex. Rebased onto refreshed R7 #55 and R2 #54, rooted at main b0c30bed. Generated files rebuilt with npm run build; no hand edits. The source-sized full-copy timing and actual Pages/Worker wake regressions pass after the rebase. Fresh full CI must use the new exact head. Live resource/throughput certification remains unclaimed.

## Sequential integration after #55 merge, 2 November 2026 15:30 SGT

Model: Codex. Reviewer: Claude at the new exact remote head recorded in PR #56. Actual main is `9cddc0d99072221940d8213b31e0ebe702e05dfe`, the owner merge of #55. Previous remote head `91c64e71e4b17f3daba7571f6c916dff4cca9f67` matches the local pre-rebase tree and is archived locally. The owner explicitly authorises this expected-head, lease-checked branch replacement, overriding the workflow default against force pushes. Only the R3 successor delta is applied; merged R1/R2/R6/R7 source and task entries remain. All 18 canonical components regenerated with `TZ=Asia/Singapore npm run build` (exit 0), without generated hand edits.

Fresh focused results: actual Pages/Worker backup wake and source-sized throughput PASS; 13,500 rows, 12,206,531 source bytes, 49 Google calls, 6 Worker runs, 500-item maximum page and 21m20s simulated elapsed under 20-second calls and 60-second intervals. Server-only import continuation, verified Google/D1 Deploy quotas with best-effort cache, and D1/fenced-Google no-resend checks PASS. LORD: 39 programs, zero failures, using the available Chromium. Fresh full Node/Chromium/LORD CI result and exact published head follow in the PR handoff. Live throughput/resource certification is still unclaimed.

Owner sequence: Claude reviews this exact head, owner merges #56, then Claude rebases #50. #50 must merge before Codex rebases test-only #58; #59 follows #58 and stays draft. Held product PRs and quiet-mode work remain unchanged. No live import, backup, archive, deployment, authority/configuration, school-record or provider-send action.
