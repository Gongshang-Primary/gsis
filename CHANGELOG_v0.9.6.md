# v0.9.6

## Packaging repair, 26 October 2026

* Bundle Roster and Deploy Pages Worker dependencies into each delivered `_worker.js`, matching the full-release builder.
* Verify bundled source parity and execute standalone Worker smoke tests against the actual ZIP contents.
* Preserve application version v0.9.6 and every other frontend asset, backend and notification Worker byte.

## Cron

* Check due work in primary D1 before loading Roster state or preparing notification templates.
* Preserve configurable summaries, 05:30 morning behavior, allocation windows, reminders, retries, stale-claim recovery and manual decisions.
* Remove the redundant Calendar HTTP request from the D1 scheduled path.
* Read fresh-reference timestamps before loading the full Contacts/Calendar snapshot.
* Export only changed audit dates and skip history scans when the Roster head is unchanged.
* Add partial D1 indexes for live dispatch work and a small Deploy handoff preflight.

## Timetable storage

* Exit empty unchanged preparation jobs without R2 reads or full Roster hydration.
* Detect relevant source changes and date rollover to recover missed enqueueing.
* Retain at most two stage jobs per invocation; preserve claims and newer job generations.
* Prepare stored manifests without assembling a discarded download response.
* Hydrate changed plan dates only and retain existing immutable parts.
* Include MK and appointment eligibility in suspended-package source versions.

## R2 cleanup

* Add separate daily cleanup at 02:15 Singapore time for old unreferenced generated cache parts.
* Use 30-day object age, 24-hour quarantine, persistent cursor, daily lease, list limit 50 and delete limit 10.
* Protect current manifests and concurrent writers with permanent retirement markers and atomic promotion checks.
* Preserve source timetables, staff records, saved plans, media, audit archives and recovery objects.

## Included from v0.9.5a

* STAPLER Add teacher includes all Contacts staff except MK, including support staff and inactive staff.
* Partial case-insensitive text search includes name suffixes such as SENO.
* Relief eligibility remains separate from STAPLER membership; local draft, Save and Confirm remain separate steps.
