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
