# GSiS Suite v0.9.1

24 October 2026, Singapore time. This release promotes the retained correction at `81cc56a` (`v0.9-correction`) and aligns LORD, OVERLORD, STARLORD, Layout, Deploy, Roster, Calendar and Contacts to **0.9.1**. npm metadata also uses `0.9.1`. Storage schemas, cache identities, request protocols and approved provider template names retain their independent versions.

## Included corrections

* LORD reads its installation values from Apps Script Properties. LORD, OVERLORD and STARLORD Workers read their backend URL and proxy secret from Pages bindings. Runtime code contains no restored private configuration. Preserve existing secrets and booking peppers before replacing saved source.
* Report Absence restores **Periods and timings**, **I'm not available during the above selected periods** for local review, and **Submit absence** for the final save. Full-day and clock coverage remain available when no authoritative period grid exists.
* SMC/admin can choose multiple **Absent teacher(s)** with searchable chips. Every teacher/date is validated before one durable batch save and receipt; a validation failure saves none of that batch. Ordinary teachers remain self-only, and instructions remain separate by teacher/date.
* Confirmed save feedback stays above **Relief instructions**. Pending status is neutral, errors are red and accepted saves are green. Ordinary submission avoids an optional colleague read and a duplicate delivery-state read while preserving the fresh locked commit.
* **Own arrangements** restores the full-day timetable: absent teacher first, colleagues below, common period columns and partial-name search. Cover and Combine remain explicit, permission-checked requests. Unconfirmed colleague timetable changes remain private to authorised planners.
* School-wide absence management offers **50 / 100 / 150 / 200** entries per page. Date filtering and selected eligible records are retained.
* Compact report reads preserve every explicitly selected teacher, including a one-teacher selection on a confirmed STAPLER day. The full deployment includes the settings guide and `READ_FIRST.md`.

The v0.9 protections remain included: human allocation authority and named conflict review, allocator progress/cancellation, durable STAPLER retries, trusted timetable-window invalidation through 30 days ahead, and LORD's own validated Contacts/published Deploy reference snapshots. No additional feature behavior is introduced by this version-label promotion.

## Installation

1. Read `READ_FIRST.md` and `LORD_SETUP_v0.9.1.md`; save or preserve the required settings before replacing code.
2. Install each matching backend in its existing owner project, then its matching frontend; Calendar enforces a matching version, and rollback must restore both sides together.
3. Preserve existing URLs, data identities, booking peppers, session settings, receipts and writer ownership; reload open tabs after installation.
4. Complete the maintainer guide's installed acceptance checks before routine use.

The full deployment declares 25 members: eight frontend ZIPs, five complete Apps Script backends, one Roster notification Worker and eleven documents. The outer suite also carries source and Git history for recovery. Keep the private settings ledger outside both archives. No live deployment, settings change, timetable publication, provider send or data migration is performed by creating this release.

## Verification and remaining work

Fresh v0.9.1 verification results are recorded in source `VALIDATION.md`; historical v0.9 counts are not evidence for this build. Release delivery requires the source checks, LORD checks, Apps Script syntax gate, full-package parity and committed-source package checks to pass.

Local checks do not establish live peak throughput, Apps Script cold-start latency, provider delivery or installed settings validity. Automatic emergency notices for new absences after first publication and before 14:00, targeted affected-teacher publication follow-ups, expanded Calendar provider cooldown and the future `venues.gsps.edu.sg` booking pipeline remain queued. Existing venue storage is retained; no new venue sheet is created.
