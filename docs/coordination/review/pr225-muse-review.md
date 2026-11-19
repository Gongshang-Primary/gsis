# Review: PR #225 — Restore per-booking overdue Telegram monitor

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `cf4caa0e1b2fc6e86ddbc1f6e699875082990985`.
- Branch: `codex/v1-lord-overdue-monitor`. Base: main `184b8d0a` (claims after deployed v1.06 `bd77b27`). PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised. Changed deployment component, if separately approved later: LORD Worker only.

## What it does

UAT010. The explicit OVERLORD Telegram monitor now reports actual overdue physical custody per booking, replacing the periodic count summary. An hourly count summary no longer substitutes for an overdue alert.

- `enqueueMonitor` scans every five-minute bucket (`lord:monitor-scan:<bucket>` in `lord_job_marks`; `already-scanned` dedup). The query filters actual overdue custody before the 100-row bound: status COLLECTED, remaining devices/accessories > 0, expected end (from periodTimings) strictly more than 30 minutes past. Bookings with an existing durable `lord:monitor:overdue:<bookingId>` outbox job are excluded, giving one durable Telegram identity per booking across partial returns and later scans.
- Each booking is committed via `systemCommit` with guards on the booking revision and the periodTimings revision, so a changed booking end withdraws the old captured alert. A per-booking commit failure is recorded as pending, not fatal to the scan.
- `dispatchMonitor` cancels legacy count-summary jobs (`LEGACY_MONITOR_SUPERSEDED`), then rechecks current authority/configuration via the Core dispatch check, the monitor chat configuration, and the live custody state via `overdueContext` (COLLECTED, remaining > 0, timings resolve, grace elapsed). A changed booking end cancels with `BOOKING_END_CHANGED`. The message carries borrower/resource labels, booking end, remaining quantities, and overdue minutes.
- Existing hourly rows stay recorded and are cancelled as superseded before sending. The existing 18:00 administrative closure is unchanged and does not invent physical returns. Accepted/uncertain results remain durable and are never blindly replayed; previously withdrawn/failed alerts are not automatically revived. No migration, no overdue WhatsApp behavior, no frontend control. Teacher reminders are the separate UAT009 branch (#221, `66109e4`), not included here.

## Scope, merge, secrets

- Diff vs origin/main: exactly 4 files, matching the task record's exact four-path scope (`docs/coordination/tasks/v1-lord-overdue-monitor.md`, `v1/services/lord/jobs.mjs`, new `tests/v1-product-lord-overdue-monitor.mjs`, existing `tests/v1-product-lord-notifications.mjs`). 295 insertions, 61 deletions. `jobs.mjs` changes are limited to `enqueueMonitor`/`dispatchMonitor` and their small local timing/custody helpers; the UAT009 reminder hunks are untouched.
- The notifications test diff replaces only the superseded hourly-summary expectation (3 sends → 2, no Telegram summary without overdue custody); every other notification/authority/recipient/uncertainty assertion is retained.
- `git merge-tree --write-tree --name-only origin/main cf4caa0e1b2fc6e86ddbc1f6e699875082990985` clean (tree 12c3cc7e22a61140dfd30e0e099873b68f1ac998).
- Pair integration with #221 (`66109e4`): merge-tree `d5fd92c031ad07ade3682547cc713eb2a2b2b31e`, matching the PR body's claim — clean, no resolutions.
- Secrets scan of the diff: clean.

## CI at the exact head

- Node/LORD run 44414899174: success at head cf4caa0 (all four shards + full-suite).
- Dispatched product run 44415268163: success at head cf4caa0.
- PR-triggered product run 44417052315: success at head cf4caa0 (all 134 product programs).

## Local checks at the exact head (Singapore time, Playwright chromium-1234)

- `npm ci` root and `v1/`: exit 0.
- New test PASS: `v1-product-lord-overdue-monitor` (5 groups).
- Regressions PASS: `v1-product-lord-notifications`, `v1-product-lord`, `v1-product-lord-recovery`, `v1-product-lord-declarations`, `v1-product-lord-reference`, `v1-product-lord-cart-groups` — all six LORD programs.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs`: exit 0. `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q05 supported by the scoped inventory, the existing receipt/job-mark/outbox machinery, the dispatch-time rechecks, and the bounded scan. Q06 supported by exact-head CI above plus the local runs. Q07 is this review. Q08 is outside this task.
- Hosted scheduler behavior, real Telegram delivery, runtime UAT, T1B-01/T1B-02, and N-1: **Not tested**. F5 remains OPEN.
