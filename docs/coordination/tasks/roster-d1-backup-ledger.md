# roster-d1-backup-ledger: D1 backup to Google Drive with an auditable ledger

- Status: changelog (owner 5 Nov: "maintain a separate ledger i want to 'audit' / specify the amount of backup data that is written on Google Drive"); lane R; Codex when authorised
- Reviewer/model: Claude

## Finding (Claude, 5 Nov)
In the fresh-start mode (#79), the ordinary Google mirror is **suppressed** by design (it would overwrite the frozen Google archive). So after the 6 Nov fresh start, **no D1 record is written to Google Drive at all**. Recovery then relies on D1 itself (Cloudflare D1 Time Travel, point-in-time restore within its retention window) and the R2 objects, plus the "Switch back to Google" re-entry report. In the imported mode the mirror queues each saved revision for a Google backup in the background (Worker cron), outside the user's request.

## Requirement
1. A scheduled backup (Worker cron, outside any user request) writes D1 Roster records to a **new** Drive folder, never into the frozen archive files. Daily full snapshot (for example 02:15 SGT, after LORD's 02:03 sync) plus optional hourly increments by revision. Compressed JSON, with a SHA-256 digest.
2. Ledger: D1 table `gsis_backup_ledger` (one row per run: started/finished, kind full/increment, revision from/to, record count, bytes raw/compressed, Drive file id, digest, duration, status, error). Retained, never pruned.
3. Owner control in System Config (Admin): on/off, schedule, full vs increment, retention on Drive (default keep all), size alert threshold.
4. System Health: last backup time, age, size, status; alert SMC/Admin if older than 26 hours or failed twice. Admin page lists the ledger, filterable, CSV export.
5. Restore drill: an Admin "verify backup" reads the latest file back, checks the digest and record counts against D1, writes the result to the ledger.
6. No effect on the UI: no write in the user's request path; Apps Script work bounded and lock-free against Roster (Google is archive-only in fresh mode); skip when the previous run is still running.
7. Tests: backup runs and ledger rows; digest verify; failure recorded and alerted; no mirror into the frozen archive; a request during a backup stays fast.
