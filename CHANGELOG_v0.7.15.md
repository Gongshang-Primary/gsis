# GSiS v0.7.15

Baseline: v0.7.14a at 8588d19387933fbdfd20fcf1902fbd5e5ac16f58. Full release authorised on 19 October 2026, Singapore time.

## Saved suspended timetables

Save must retain the imported dated draft when the browser refreshes, without requiring Confirm. This release aligns the backend request limit with the existing Stapler plan and frontend limits. Ordinary operation limits remain unchanged. Authentication, current dated editing lock, revision checks, validation and compressed storage still apply.

Confirm remains a separate action. It makes the saved suspended timetable available to summaries, Excel and relief allocation. Daily publication remains separate. Existing online absences and the recurring baseline remain intact.

## Suspension dates and timetable loading

The dates list reads dated lock details from one fresh Script Properties snapshot per request. Editing and saving still check current ownership within the write lock.

The planner shows the freshly loaded timetable while it acquires the editing lock. Editing remains disabled until ownership is verified. Changing dates or returning to the date list prevents an older lock response from replacing the current screen. No timetable response cache has been added.

## Full package carry forward

This package includes the final offline timetable importer from v0.7.14a plus all v0.7.14 exports, Name Bridge, allocation and layout changes. All five frontend and three backend labels are v0.7.15. The existing notification Worker is included with its generated shared gateway.

Imported teachers receive their complete final day, including blanks. Teachers entirely missing from the JSON retain baseline and default present, subject to separately saved absences. Uncertain teacher matches require explicit resolution. Nonempty offline reliefAbsences remain rejected; the five supplied timetable examples do not cover offline attendance decisions or swaps.

## Verification

See VALIDATION.md and RELEASE_SUMMARY.json for checks actually completed and their limits. Local tests do not establish the deployed school's response or production latency. This release build does not install code, reset data, publish a timetable or send staff messages.
