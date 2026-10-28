# GSiS v0.8.7 full release plan

Goal: deliver the queued changes in items 112–131, preserving the confirmed timetable and delivery alert repairs in v0.8.6a.
Spec: GSiS_Queued_Changelog.md, items 112–131. User authorised the next full version on 22 October 2026.

## Global constraints
Preserve SMC manual assignments, authenticated role boundaries, exact-notice acknowledgement, recipient absence filtering, stable retry IDs, published snapshots and seven-day private links. No production messages or live state changes without explicit task authority. Full package contains only deployables, gCodes, Worker text, one maintainer guide and one HTML manual; include the Archify system explainer in that HTML manual so it remains one document. No runtime dependencies fetched at page load. Ship as 0.8.7.

## Tasks and file ownership
1. Notifications: new transport store/dispatcher module plus roster Worker and notification-worker source; isolate mutable delivery state and locking from roster writes, freeze intent, batch/pace sends, preserve migration and retry semantics. Notify coordinator before any shared module edit.
2. Roster writes: backend/RosterOperations.gs and new scoped command module; scoped acknowledgement, compact receipt recovery, absence save preparation outside lock, lightweight own-notice reads. Coordinate notification integration through explicit hooks.
3. Loading: roster.js, baseline/report caches, timetable preload and RosterTimetableBatch.gs; persistent authorised batches, known-key refresh and deferred feature scripts. Coordinator integrates Stats and acknowledgement home actions through supplied modules/hooks.
4. Statistics: new shared/roster-statistics.js, backend/RosterStatistics.gs, public/roster-statistics-ui.js and CSS plus focused tests. Restricted range projection, accurate counts, coverage, local Excel, compact sortable tables and interactive bars. Coordinator wires existing entrypoints.
5. Allocation/UI: shared/roster-allocation.js and roster-operations-ui.js; business preferences and 8-period soft demotion, top acknowledgement action/shared action module, publication timestamps, nonblocking mutation UI.
6. Coordinator: shared/roster-operations.js, RosterDeliveryReview.gs, report content/deep link, integrations/build/package cleanup, maintainer/manual/Archify, source tests, independent correctness/quality reviews, commit and durable artifacts.

## Design decisions
Use current school calendar boundaries for terms. Presets default to completed prior intervals (current week through today); expose explicit Start/End dates. Omit undefined legacy Hearts metric. Absences show teacher-days and periods separately. Relief activity periods are separate from R cost; combine costs zero R but counts as activity. Historical coverage must be explicit, never fabricated. Keep absence and allocation under one authority; optimise rather than introducing another attendance owner.

## Review focus
Concurrent acknowledgements must not require a whole-roster revision match. Transport updates must not rewrite allocation state or regress newer delivery results. Replayed saves preserve exact IDs and effects. Changed/withdrawn confirmed plans and authority changes invalidate only permitted caches. Statistics reconcile unique teacher-period counts and expose missing/pruned or aggregate-only history.

## Validation and release
Each implementer adds focused executable regression evidence for its actual risk and reports changed paths/tests/limitations under docs/reviews/v087. Run necessary combined regression suite, syntax/build gates, complete-package member checks and role/install smoke checks. Two independent final passes cover correctness and structural quality; fix material findings. Commit sources, build deterministic full deployables against committed tree, save deployment plus source-history bundle. Record live investigation limits honestly.
