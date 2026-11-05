# Daily Roster Drive outputs

Model: Codex. Prepared for review; no deployment or live write has been performed.

## Setup after owner approval

Use the same signed Apps Script output adapter, D1 and private R2 bindings as [the backup service](ROSTER_DRIVE_BACKUP_RUNBOOK.md). The ordinary Google mirror remains off in D1 fresh-start mode. Daily outputs have their own enable switch and do not depend on scheduled backups being enabled.

In Admin System Config, set the GSiS home-base folder ID, enable daily outputs, and set the folder ID for `01 Live Data/Roster/Daily Relief`. Set the existing `Allocation Audit` folder ID if desired; otherwise the writer finds that exact folder under `01 Live Data/Roster`. It refuses outside folders, ambiguous names, shortcuts, wrong file types and frozen archive files. The owner manages Drive sharing. GSiS never changes permissions.

The notification Worker requires the new even-minute cron `0-58/2 * * * *`, in addition to the existing schedules. Its separate invocation processes at most two dates at a time. The backup cron remains on odd minutes. Both use `gsis_backup_ledger`; daily outputs use a separate date queue and lease.

## Files and updates

Each verified school date with data has one `Daily Relief/YYYY/MM/YYYY-MM-DD Relief.xlsx` and the existing `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt`. The workbook uses the existing Roster/Stapler renderer and operational overlay. Every active teacher and activated ad-hoc teacher has four rows, including empty rows. Period and timing headings and the teacher column are frozen. Orange is relief, pink is extra duty, grey is absence. No absence reasons or medical types appear in either file.

The Allocation Audit keeps its chronological event format and full retained trail. A Day summary and rules glossary come first. Newly accepted automatic, manual SMC and peer decisions capture their check results, R% and alternative count/categories. Missing historical evidence is labelled unknown. Summary assignments appear once; the event trail retains repeated changes to the same lesson. Quiet mode pauses the audit TXT while workbook updates continue. Turning optional verbose logging off retains the existing essential-event policy.

Committed allocation, publication and dated relief changes create D1 intents in the same transaction. Rendering, R2 storage and all Drive I/O run in the background. At most one attempt per date starts every two minutes. An overlapping invocation skips. A failed date backs off without blocking other dates or Roster edits. The provider uses an output-only UserLock, never the Roster ScriptLock.

The first run after Singapore midnight freezes a FINAL payload. Retries use those exact retained bytes even if D1 is corrected later. Once FINAL is verified, neither the queue nor Drive writer rewrites the file. If quiet mode delays the audit, its FINAL payload remains frozen until quiet mode ends. Later corrections remain in D1 and backups. A provider response lost after a successful write reuses the same file ID and digest on retry.

## Verification and recovery

System Health shows each date, current/final state, last attempt, verification and per-file revision. The shared Admin ledger filters `excel` and `log` and exports Drive file ID, version, digest, size, duration and result to CSV. Two consecutive failed attempts for a date raise an alert through the existing SMC/Admin route. Alerts deferred by quiet hours or unavailable recipients stay pending.

Every written file is read back and checked with SHA-256. Rendered payloads are retained compressed in private R2. Limits are 16 MiB raw and 8 MiB compressed per file; an excess or missing archived audit evidence fails visibly rather than truncating the trail. Check the first enabled school day and representative Stapler/peer duties before relying on these derived files.

To recover a failed date, correct its reported folder, source, privacy or provider problem and allow the next timer to retry. Do not manually reset a FINAL flag. Do not use the daily workbook as a database restore source; use the separately verified backup restore workflow. Disabling daily outputs stops new writes and preserves all existing files, queued evidence and ledger rows.
