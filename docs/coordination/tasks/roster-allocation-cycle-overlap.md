# roster-allocation-cycle-overlap: per-minute allocation cycle starves Google saves (incident 3 Nov 2026)

- Status: implementing for v0.9.9j item 2, owner-authorized 4 November 2026
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 4 Nov 2026

## Incident (evidence)
- From 17:59 SGT, `allocation` (`scheduledRoster`, Worker roster-scheduled-cycle) recorded TIMEOUT every minute (about 150 in a row, D1 gsis_job_health_history). claimNotifications, inboxPendingDispatch, allocationAuditExport and processAbsenceIntake also failed (HTTP_ERROR / TIMEOUT).
- Apps Script Executions (owner screenshot 20:24): all doPost, Version 59, none failed; about 10 per minute, up to 6 running at once, 4-15 s typical, 40-75 s for some.
- Owner save in Assign Relief: UPSTREAM_TIMEOUT (reference 1f8cb82d-2998-45c9-b24a-ac37e61b6a2c).
- Venues fence clear (venuesFenceDiagnose 20:24: marker ready, revision cb1c9765 matches, no pending token).
- Owner turned on Quiet mode 20:25:32: no new job failures after 20:25:52; notifications idle (success) 20:27; owner save succeeded about 20:33.
- Conclusion: the allocation cycle for tomorrow (from 16:00, every minute) ran longer than the Worker's 30 s timeout; each minute started another run while the previous one still held the script lock, so saves queued and timed out. Relief records are about 19M characters, read in full per call.

## Fix (Codex)
1. Single flight: do not start `scheduledRoster` while a previous run is still active (D1 lease with expiry, or a backend in-progress marker); skip and record SKIPPED_BUSY, not TIMEOUT.
2. Bound the run: the backend must finish or yield under 25 s, saving progress, so the Worker never abandons it mid-lock.
3. Back off: after 2 consecutive timeouts, run every 5 minutes until one succeeds; record the backoff in System Health.
4. Never hold the writer lock while computing; compute outside, lock only to commit with a revision check.
5. Tests: overlapping triggers start one run; a run over budget yields and resumes; backoff engages and clears; foreground save during a cycle is not blocked beyond the lock commit.
Also applies on D1 if the edge cycle shares the shape (check `edge-roster-domain.js` schedule).


## v0.9.9j implementation claim, 4 November 2026

Model: Codex. Reviewer: Claude at the final exact head. Branch: `codex/roster-allocation-cycle-overlap`. Base: main `661e79004a274a33bdee6753507c9efa524cf007`, tree `054125ee825e7ccd1ae93f57933c4d5d51cdac36`. Owner exception allows the j lane R queue back to back; item 1 is published for CI before this implementation starts. Hand off each green PR immediately.

Bounded scope: the notification Worker's allocation admission/lease/backoff and safe health state, the existing backend allocation-run budget/checkpoint flow, focused behavioral tests and regenerated bundles. Preserve the existing audit lane, quiet-mode zero-call behavior, receipt identity, run cancellation, date/slot limits and final revision/source checks. Compute outside the source lock and bound the commit admission. No cutover, freeze, import authority, data repair or deployment changes.

Acceptance: concurrent triggers submit one Google cycle; a live lease skips with SKIPPED_BUSY; two timeouts enter five-minute backoff until success; budget exhaustion yields retained progress; repeated/resumed calls preserve saved receipts; foreground saves are not held behind planning. Full GitHub Node/LORD suite and Claude handoff at the exact PR head.


## Implemented behavior and limits

A D1 singleton admission row fences the allocation cycle before Calendar/Google preparation. Overlapping triggers and confirmed backend contention skip with `SKIPPED_BUSY`. Two actual timeouts enable five-minute backoff until a confirmed successful check. An uncertain HTTP/network/invalid-response outcome retains its lease; it does not mean Apps Script stopped. The nine-minute uncertainty lease covers the two-minute accepted scheduler-stamp window, six-minute Apps Script execution ceiling and one-minute margin, so it can delay a backoff admission. System Health shows safe timeout/backoff/lease counters and a readable backoff state. The existing quiet checks and audit cron contract are preserved.

Google scheduled work uses a 14-second initial planning admission budget, 18.5 seconds for verified cached context, and a 24-second save deadline. Preparation and current-state merge occur outside the source writer lock; scheduled control/commit admission uses a short wait. A private gzip checkpoint, bounded to 262 KiB stored data, retains date context or a finished compact proposal delta. It excludes unchanged full history. The next tick can reuse that work after checking its run, slot, source, Contacts and reference proofs. Resumption refreshes the fence without consuming another attempt merely for a budget yield. Cancellation and the slot/morning cutoff remain enforced. New receipts, audit and outbox facts from foreground writes are preserved by the final source/version checks.

D1 calculations remain outside the storage transaction. A cooperative compute budget plans on a shadow state, so a late or unfinished proposal does not alter the human draft. Yielded slot state and receipts support a later checked retry. Run-start admission rechecks a preflight continuation against the current run ID, yielded state and slot, so cancellation/replacement cannot be resurrected.

These are cooperative work budgets. A provider read/upload already in progress cannot be forcibly interrupted by Apps Script; no universal wall-time promise is made for arbitrary provider latency. The uncertainty lease prevents another Worker call being admitted while that execution may remain alive. Finished context/proposal stages resume; the internal unfinished solver search tree is not serialized. The prior saved draft, durable receipts and bounded-attempt rules remain authoritative.

## Verification and review

New behavioral cases first failed for concurrent Worker calls, missing D1 budget, unsafe lease release on an uncertain response, unsafe health codes and stale D1 continuation admission. The backend suite also exercises useful checkpoint continuation, corruption/source-change refusal, a same-revision foreground write, cancellation and cutoff. Full exact-head GitHub Node/LORD evidence and the final focused counts are recorded in the PR handoff. No production acceptance, deployment or live records are claimed.

Rollback restores the prior scheduler admission/budget behavior. Existing operational records, receipts, run ledgers and private progress files remain retained; no automatic cleanup or authority change is introduced.


Final local integration: all18 components rebuilt and nine focused programs passed, including30 scheduled-run cases,17 lifecycle cases, nine Worker lease/backoff cases, real D1 continuation/cancellation/cutoff cases, idle/audit-lane contracts, health UI and21 quiet catch-up cases. Review caught and fixed source reads under recovery locks, stale D1 preflight cancellation/replacement, missing/non-running D1 claims, obsolete yielded markers and an extra full-state read on prepared resume. A five-second-per-I/O fixture now completes in23s/20s/20s across three calls, with one context build, one allocation calculation, one fullsource read per call and one source commit. Original SMC summary timing and notification-intent counts are retained. Internal unfinished solver search is still retried rather than serialized. Final full GitHub Node/LORD results belong to the PR handoff; no live performance result is claimed.
