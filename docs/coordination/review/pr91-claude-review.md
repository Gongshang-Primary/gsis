# Claude review of PR #91 (always load confirmed Stapler) at exact head e59372a (6 Nov ~11:15)

- Verdict: **approve** (owner merges).
- CI: complete green run 42154702443 at e59372a (all four shards + full-suite); a later duplicate run 42155625960 was cancelled (shows as failure; not a test failure). Claude locally: 29/29 changed or new test programs pass; canonical build clean; merges cleanly.
- Checked: `readyStaplerPlan(row,audit)` now returns the retained **confirmed** snapshot (`confirmedStaplerSnapshot`), never the working draft; used by allocation, reconcile (lesson-level release + guard), reference day, publication, Report Absence, exports/Drive, teacher views and preload. Assign Relief/Daily Notify show "Timetable: Stapler plan rev N (confirmed HH:MM)" or "Baseline …"; never-confirmed drafts show the baseline warning with a Confirm shortcut.
- Live D1 compatibility (read-only, 6 Nov 11:15): every live plan carries `confirmedPlan` + `confirmedRevision` (6 Nov rev 3/3; 10 Nov draft rev 2, confirmed rev 1; 12 Nov draft rev 2, confirmed rev 1).
- **Behaviour change to tell SMC**: today 10 and 12 Nov run on their unconfirmed draft rev 2 (old code returns `row.draft` when confirmed=1). After #91 they run on **confirmed rev 1** until someone confirms rev 2. SMC should review and confirm 10 and 12 Nov drafts after deploy if rev 2 is intended.
