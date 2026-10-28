# v0.8.7 Roster cache and shell review

Implemented item 124 and shell integrations for Statistics, personal acknowledgement, and item 129's dated Daily Notify link.

## Loading and read ownership

The nonsensitive Roster shell appears before session/profile requests complete. Protected timetable snapshots are restored only after the current account is verified and the authenticated timetable-batch endpoint validates that stage's source key. Baselines arrive/install first; authorised suspended plans follow. Normal teachers receive confirmed projections; SMC/Admin may preload their authorised drafts. The current Singapore day through day +30 remains the window.

The existing IndexedDB database upgrades from version 1 to 2 without deleting old models. Models and batch snapshots share the verified email/staff/SMC/Admin owner scope. A new account or role removes other owners. Logout and relevant access denial delete the current owner's persisted models/snapshots; generation checks fence late reads. The batch adds no absence records or notification access tokens; suspended projections redact imported absence reasons.

Snapshots retain at most four records and approximately 32 MiB per owner, with a two-day retention cutoff; immutable models retain at most eight records and approximately 32 MiB. Gzip transfer and native decompression remain the default, with JSON recovery for unsupported/broken transports. A merged delta is saved as one compressed snapshot where native compression is available. Browser storage failure falls back to online reads. Decoded batch limits remain 64 MiB per stage; validation yields between multiple models.

A ready `ROSTER_TIMETABLE_CACHE` property contains a timetable-content revision digest. RosterOperations commit hooks mark relevant writes pending before the durable write and ready afterward. Missing/pending markers force fresh reads, including after an interrupted write. An acknowledgement or delivery-status-only update does not change this marker. Identity, role, current Contacts eligibility and baseline register sources remain part of cache validation.

With an unchanged source key, each batch endpoint skips timetable model downloads and the operations-document read. Changed suspended sources return changed plans, deleted dates and a current date/plan manifest. The endpoint still loads the operations snapshot when its timetable source changed; this is a payload delta and unchanged-source optimisation, not a new cell database. Concurrent source changes are rejected and retried once from baseline. Freshness checks refresh manifests without deleting reusable baselines; current operational saves and authority stay online.

## Shell integration

- Statistics is present only for verified SMC/Admin; its module receives `{container, api, profile, today, go}` and is disposed when leaving.
- Home mounts the shared personal acknowledgement module above icons, with the same verified owner used by My Relief Duties. Logout/role changes clear it. Periodic authority verification refreshes its current status.
- `?date=YYYY-MM-DD#dailyNotify` opens that date after verified SMC/Admin access, survives Google sign-in and rejects impossible dates. Opening a link performs no mutation. Normal teachers receive their regular Home.
- `statistics`, `statisticsCalendar`, and `acknowledgementStatus` are classified as reads. Acknowledgement writes no longer invalidate timetable preloads.

## Verification

Passed locally against source with mocked external services and real Chromium where listed:

- `node tests/roster097-batch-backend.cjs`: 27 checks, including zero model/operations reads for unchanged manifests, unchanged marker for acknowledgement/transport updates, changed/deleted date deltas, pending commit, revoked Contacts eligibility and overlapping writer detection.
- `node tests/roster097-batch-client.cjs`: 25 scenarios, including baseline-first restoration after online validation, corrupted persisted-model recovery, changed/deleted plan merge, storage failure, role downgrade and late-response fencing.
- `ROSTER_TEST_CHROMIUM=/tmp/chromium node tests/roster087-cache-storage-browser.cjs`: real IndexedDB upgrade, reload persistence, owner isolation, eviction, expiry and sign-out removal.
- `ROSTER_TEST_CHROMIUM=/tmp/chromium node tests/roster087-shell-routing-browser.cjs`: dated link, teacher restrictions, invalid date, actual Statistics module contract and sign-in preservation.
- `ROSTER_TEST_CHROMIUM=/tmp/chromium node tests/roster097-batch-lifecycle-browser.cjs`: interactive baseline stage, 403 fencing, 60-second expired-day authoritative refresh, logout and role downgrade.
- `ROSTER_TEST_CHROMIUM=/tmp/chromium node tests/roster097-batch-shell.cjs`: real shell renders icons before sequential gzip stages and displays a future baseline plus confirmed day locally.
- `node tests/roster718-bootstrap-cache.cjs`: existing report bootstrap authority/caching checks.
- JavaScript syntax and `git diff --check` passed.

No production Apps Script/Drive/Sheets calls, deployment, notification sends, build or commit were performed by this workstream. No live response-time claim is made. Live deployment must include the updated RosterOperations commit hooks and RosterTimetableBatch code together. Existing installations automatically gain a ready source marker on the next successful relevant Roster commit; before that, correctness is preserved through full snapshot reads.
