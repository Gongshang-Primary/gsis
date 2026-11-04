# roster-allocation-cycle-overlap: per-minute allocation cycle starves Google saves (incident 3 Nov 2026)

- Status: open; assign to Codex (lane R) after the D1 cutover
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 3 Nov 2026 20:35

## Incident (evidence)
- From 17:59 SGT, `allocation` (`scheduledRoster`, Worker roster-scheduled-cycle) recorded TIMEOUT every minute (about 150 in a row, D1 gsis_job_health_history). claimNotifications, inboxPendingDispatch, allocationAuditExport and processAbsenceIntake also failed (HTTP_ERROR / TIMEOUT).
- Apps Script Executions (owner screenshot 20:24): all doPost, Version 59, none failed; about 10 per minute, up to 6 running at once, 4-15 s typical, 40-75 s for some.
- Owner save in Assign Relief: UPSTREAM_TIMEOUT (reference 1f8cb82d-2998-45c9-b24a-ac37e61b6a2c).
- Venues fence clear (venuesFenceDiagnose 20:24: marker ready, revision cb1c9765 matches, no pending token).
- Owner turned on Quiet mode 20:25:32: no new job failures after 20:25:52; notifications idle (success) 20:27; owner save succeeded about 20:33.
- Conclusion: the allocation cycle for tomorrow (from 16:00, every minute) ran longer than the Worker's 30 s timeout; each minute started another run while the previous one still held the script lock, so saves queued and timed out. Relief records are about 19M characters, read in full per call.

## Fix (Codex)
1. Single flight: do not start `scheduledRoster` while a previous run is still active (D1 lease with expiry, or a backend in-progress marker); skip and record SKIPPED_BUSY, not TIMEOUT.
2. Bound the run: the backend must finish or yield under 25 s, saving progress, so the Worker never abandons it mid-lock.
3. Back off: after 2 consecutive timeouts, run every 5 minutes until one succeeds; record the backoff in System Health.
4. Never hold the writer lock while computing; compute outside, lock only to commit with a revision check.
5. Tests: overlapping triggers start one run; a run over budget yields and resumes; backoff engages and clears; foreground save during a cycle is not blocked beyond the lock commit.
Also applies on D1 if the edge cycle shares the shape (check `edge-roster-domain.js` schedule).
