# Roster timetable cache review, 24 October 2026

Scope: `backend/RosterTimetableBatch.gs`, `roster-update/public/roster-timetable-preload.js`, IndexedDB generation storage, and their callers/tests. No production environment was changed.

## Existing protections retained

The current application already requests today through 30 days ahead, inclusive (31 dates). Uploaded models have immutable content keys. Server manifests recheck authority and supply source keys; the browser supplies its known model/plan keys and receives only changed contents. Unchanged responses do not decode timetables, validate whole models, rewrite immutable IndexedDB content or invoke redraw callbacks. Day rollover reuses model bytes. A compare-and-swap generation pointer prevents an older tab overwriting a newer persisted generation. Existing checks already distinguish server content identity from the browser's local refresh scheduling timestamp.

## Changes

1. **Limit invalidation to the visible date window.** Previously the suspended timetable source marker included every saved date. Editing a plan after the 30-day window forced all clients to load the operations document and project plans again, despite unchanged visible timetables. The existing marker now also stores a digest for the active 31-day window. Both digests use the same pending-before-write / ready-after-write protocol. An unrelated date change can leave the window marker ready. An in-window change cannot. After midnight, the all-date marker provides a safe fallback until another commit produces the new window marker. No timer or extra document is required.
2. **Recover incomplete deltas.** A suspended delta advertising a changed content key without replacement contents previously could attach the new key to an old local plan. The client now detects the missing replacement and retries that stage once without known keys. The prior generation is not promoted as new content. Existing full-stage validation still applies.
3. **Keep explicit refresh fresh.** Explicit refresh retains its own server check. A browser regression verifies that a delayed pre-write response cannot satisfy another tab's later explicit refresh. Ordinary warm/cold tab coalescing remains unchanged.

## Evidence

`tests/roster-next-window-source.cjs` reproduced the old out-of-window invalidation before the fix. `tests/roster089-cache.cjs` reproduced the missing-delta problem before its guard.

A Node VM comparison used the original HEAD backend and the modified backend with the same fixture. Each simulated 30 user checks after an out-of-window plan edit. Each check sent both the previous source key and the previous per-date keys, matching the browser request shape.

| Work across 30 checks | Before | After |
| --- | ---: | ---: |
| Operations document reads | 30 | 0 |
| Baseline model reads | 30 | 0 |
| Compressed delta payload bytes | 19,440 | 0 |
| Unchanged responses | 0 | 30 |

These were 30 simulated user checks, not simultaneous Apps Script executions or a live network benchmark. Authentication, Contacts and manifest checks still run. The saved bytes represent redundant delta envelopes, not 30 full timetable downloads: the prior implementation already suppressed unchanged model/plan bytes.

Existing browser fixture: synthetic 200-teacher baseline, 31 dates, two tabs and 30 simultaneous local requests. Cold work remained two stage requests, one model validation and one immutable content write. Warm operations made no requests. An unchanged forced check transferred zero payload bytes and caused zero extra decodes or content writes. Local timing is not a school-device or production latency guarantee.

## Validation

Passed:

- `node tests/roster-next-window-source.cjs`, including 27 existing backend checks, out-of-window pending/ready reads, date rollover, and the +30-day boundary.
- `node tests/roster089-source-read.cjs`, including statistics/timetable domain isolation and crash marker recovery. Its isolated VM fixture now supplies the real backend clock dependency.
- `node tests/roster089-cache.cjs`, including incomplete-delta recovery, identity changes, day rollover, corrupted local data and ordinary unchanged checks.
- `ROSTER_TEST_CHROMIUM=... node tests/roster089-cache-concurrency-browser.cjs`, including delayed pre-write reply versus explicit refresh.
- `ROSTER_TEST_CHROMIUM=... node tests/roster0811-cache-storage-browser.cjs`, including selective writes and stale generation compare-and-swap.

## Limits

Changing an actual in-window suspended plan still requires the existing authorised projection path. The marker does not make Google storage transactional; it preserves the existing fail-closed pending marker around the durable document commit. Known role changes remain authority scoped. The local hourly check policy is unchanged. No live save, publication, WhatsApp message or deployment was performed.
