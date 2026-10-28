# GSiS v0.9.1b reliability implementation plan

Goal: make LORD booking open with fewer sequential requests, repair text entry and return actions, make OVERLORD warnings actionable, recover STARLORD polling from stalled reads, and prepare compressed Roster timetable source data when it changes.

Architecture: keep existing Apps Script transaction, idempotency and source authority boundaries. Combine independent reads only where permissions match. Reuse one property snapshot only while the same writer lock is continuously held. Immutable compressed source pieces may be shared; personal authorisation metadata must stay fresh.

The user's explicit changelog and optimisation instructions authorise these changes and their commits. Venue product implementation is a separate design workstream; future optional features remain in the separate uncommitted backlog.

## Tasks and evidence

- [x] LORD Remarks: reproduce Space interception in a real browser, restrict card shortcuts to the card, preserve focus/cursor through redraw, test draft/save/reopen.
- [x] LORD Return: equal thirds in one row, Back left, red issues middle, green clean right, two-line labels; inspect desktop and narrow phone geometry and keep discrepancy checks.
- [x] LORD load: return current references and one requested day in one authenticated request; do not put booking data in a shared reference cache. Test cold, warm, failed and stale-date responses.
- [x] LORD queue: batch admission reads under the existing uninterrupted lock, preserve durable tasks and uncertain-write handling, measure snapshots for 1/5/20 bookings.
- [x] OVERLORD diagnostics: distinguish current attention, automatic retry and historical warnings, expose safe actionable details without credentials or personal payloads, preserve uncertain sends.
- [x] STARLORD refresh: bound headers and body together, release coalesced requests after timeout, ignore old completions, preserve last-good display and show recovery status.
- [x] Roster preparation: immutable compressed source packages at writes, trusted commit markers, role-specific metadata at read time; fault-test partial preparation, concurrent source change and stale-generation rejection.
- [x] LORD photo reliability: persist upload identity outside Script Properties, reuse generated Drive file IDs on retries, verify uncertain outcomes against expected actor/phase/content, retain photos through recoverable failures, and document Drive API v3 setup. Test duplicate requests, lost acknowledgements, changed content/owner, concurrent upload and committed evidence retention.
- [x] Report Absence: align teacher and dates on one desktop row, close teacher options synchronously, render verified local timetable data while refreshing narrow source markers, and test pending network, cache miss/staleness, account/date changes and preserved inputs.
- [x] Private timetable acknowledgement: retain a prominent top button, maroon while pending and green only after confirmed success; reduce avoidable first-load work without weakening signed-link expiry, source freshness or acknowledgement conflicts.
- [x] Independently review integrated source, sync generated copies, run existing suites and syntax checks, package only changed components, verify exact artifact parity, commit and tag v0.9.1b.

## Review focus

Keyboard events from nested form controls must not act on the enclosing card. A failed queue checkpoint must not cause duplicate provider delivery. A timestamp alone must not grant timetable freshness. A late timed-out response must not replace newer data. Diagnostics must not convert unknown or uncertain work into a false success.

Final evidence: 33 LORD programs passed; 158 final related GSiS programs passed, with 652 distinct programs covered across the earlier full run and targeted reruns. Apps Script syntax parsed 140 sources; source/template parity and 17 setup checks passed. Component archive preflight passed. The final package is rebuilt from the commit and annotated tag, with provenance recorded in PATCH.json.
