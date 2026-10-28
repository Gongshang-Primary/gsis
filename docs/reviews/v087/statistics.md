# Statistics implementation review — 0.8.7 / item 126

## Delivered

- `shared/roster-statistics.js`: pure restricted daily projection, grouping, range validation, calendar presets, tracking and pre-prune preservation hooks.
- `backend/RosterStatistics.gs`: one authorised, read-only operations-state snapshot per requested range. It does not acquire the writer lock, load timetables or Calendar, commit state, reconcile allocations or invoke transport. Optional gzip/base64, role-scoped content identity and unchanged responses avoid re-sending unchanged records.
- `roster-update/public/roster-statistics-ui.js` and CSS: SMC/Admin-only Statistics page with seven date presets, editable dates, inline yellow loading state, cumulative and daily reports, absence and relief rankings, accessible interactive bars, filterable/sortable absence records, and teacher/date Relief + Combine matrix. All table operations and exports after the snapshot are local. Tables use intrinsic width; rows paginate at 40; charts at 20; matrix displays seven dates and exports the whole range.
- `shared/excel-export.js`: preserves existing API and literal-string handling while supporting finite `Date` values as numeric Excel dates/timestamps (formats 14/22). Statistics exports numbers as numbers; date columns as dates; creation timestamps are explicitly labelled UTC in Excel. On-screen timestamps use Singapore time. Every export includes the selected range, mode, coverage, filters and check time.

## Counting and coverage

- Absence totals are distinct teacher-days, including partial absences. Overlapping same-day absence periods are unioned. A missing saved timetable gives an unknown period total, not zero periods. Full-day or timed coverage uses the saved period snapshot.
- Published and recorded-completed relief are labelled separately. Draft, removed, invalid, cancelled and no-relief records do not count. Draft replacements do not hide still-published duties. Audited corrections move/cancel/complete their original duties. Completion-unconfirmed replacement records are excluded from totals with a visible warning.
- Relief/Combine are unique teacher/date/period activity counts. Combine remains an activity even when its R accounting charge is zero. Multiple class rows in one combined period count once. No invented Hearts score.
- Imported weekly R aggregates remain in a separate exportable table. They are never assigned to Monday or apportioned to a partial week.
- Older or already-pruned history is explicitly partial/unknown. `markTracking(state,ctx)` begins tracking on the first authorised domain mutation; Statistics reads never start tracking or write data. `captureBeforePrune(state,{lists,maps},ctx)` preserves available compact per-date facts and coverage before destructive pruning, including actual dates moved by corrections. It scans accounting facts once, not once per removed date. Existing discarded history cannot be reconstructed by this release.
- Saved summary facts remain in the existing operations store and share its 12 MB protection. This is not unlimited historical storage; a future external annual archive can extend retention without inventing missing data. No existing data is silently deleted to make room.

## Interface / integration

- Browser: `RosterStatisticsUI.render({container,api,profile,today,go})`; `RosterStatisticsUI.unmount()` removes listeners and invalidates responses, clearing the in-memory cache. Load `GSISRosterAllocation`, shared `roster-statistics.js`, shared `excel-export.js`, then UI.
- Worker/backend read: `api('operations',{operation:'statistics',from,to,encoding:'gzip-base64-v1'|'json-v1',knownKey?})`. Backend `rosterStatisticsRead_(req,c,p)` returns `{schema:1,key,bytes,encoding,data}`, or `{schema:1,key,unchanged:true,checkedAt,revision,today}`. Role verified before state read; no browser-provided authority is accepted.
- Each request permits at most 366 days. UI accepts up to 3,660 days using bounded chunks and verifies a common operations revision and school date; it retries one inconsistent read and then reports a clear error while retaining the previous report. It never silently truncates the user's range.
- Calendar read: `api('operations',{operation:'statisticsCalendar',year})` returns released terms and configured semesters. Past term/semester selects the most recent fully completed interval. If Calendar is unavailable the two buttons remain disabled and manual dates work; no month boundaries are guessed. This week is Monday through today; other week/month/year presets select complete prior intervals.
- Parent integrates the main-page role-gated icon, read classifications, Worker/calendar forwarding, tracking/prune hooks and generated deployables. No generated build or deployment performed by this agent.

## Verification

Passed:

- `node tests/roster087-statistics.cjs`: teacher denial before state reads; projection does not mutate; same-day absence union; full/partial/pending timetable absence; published/completed distinction; zero-R Combine uniqueness; no-relief/draft/cancellation; audited corrections/date moves; history preservation and incomplete coverage; weekly aggregate separation; leap-year and authoritative term/semester presets; gzip/JSON and conditional read responses.
- `node tests/roster087-statistics-ui.cjs`: real Chromium, gzip decoding; all seven table exports; numeric dates and formula-safe literal values; local filters, sorts, chart drill-down and completion-mode changes with no API call; conditional refresh; released Calendar presets; two bounded multi-year chunks; 390 px and 1366 px layout with compact table width; role-denied UI; navigation invalidates an in-flight response.
- `node tests/release500-excel.cjs`: existing dense editable Layout Excel regression remains passing.
- Syntax checks for shared projection, UI and common Excel exporter.

Independent domain/adapter review from the allocation/UI agent found no material issue in the examined authority, projection, historical accounting, weekly imports, coverage and compression paths. Cache agent independently identified timestamp labelling risk; exports now label timestamp columns UTC and retain timestamp formatting.

These tests use synthetic records and mocked service adapters. They do not claim that live school records or historical attendance have been audited, or that deployed services are upgraded.
