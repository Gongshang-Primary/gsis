# GSiS revision P changes

Baseline: O commit `edcb6b4c4d43b2d2af7eaa4f2d4f220e2adb7cfc`. All eighteen production components are supplied under P. The separate preparation Worker retains its compatible O protocol and deployment.

## Timetable export

Remove transport-only `timing` diagnostics before downloading manifest, parts and source check. Keep native timetable bytes, hashes and every supported field unchanged. The existing O importer remains strict. A real backend serializer-to-browser-to-importer test now covers the live defect.

Derive request and diagnostic-check build labels from the compiled backend version. Keep useful logging in its normal response/log channel rather than exporting it into timetable data.

## Calendar sync

Remove the unconditional one-minute wait after a healthy five-record batch. Keep small requests, per-calendar pacing and genuine source/provider cooldowns. Preserve event/provider identities, role checks, concurrent-edit fences and unknown-receipt handling.

Make large failure checkpoints safe within Properties limits while retaining progress, failed IDs and failure details. The exact implementation and fault tests are described in `CALENDAR_SYNC_FIX.md`.

## Full-suite handoff

Supply nine frontends, six backends and three separate Worker modules. Replace the stale top-level migration handbook with current upgrade instructions. Preserve the existing critical absence pipeline; do not bind production to the preparation Worker.

The review source includes current code, tests, build tools, O-to-P changes, known limits and an independent-review prompt. Omit redundant historical manuals, generated release copies and full-history bundles from this delivery. Keep old recovery packages separate. No live school history or storage objects are pruned.

## Boundaries

No deployment, live sync, notification, absence submission or source migration is performed by building P. The relief ledger remains on hold. Calendar's optional background command service is included but not enabled. Timetable parity, identity, freshness and ownership handover remain explicit prerequisites to a later production integration.
