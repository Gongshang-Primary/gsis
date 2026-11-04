# roster-assign-relief-load-regression: v0.9.9k Assign Relief read exceeds the Worker timeout (incident 4 Nov)

- Status: open; Codex, lane R, top priority (blocks the D1 cutover and v0.9.9k)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 4 Nov 2026 16:20

## Evidence
- v0.9.9k (main e89e282) deployed ~15:50-16:05. Quiet mode on from 16:08 (no background failures after 16:08).
- Roster backend Version 60 (v0.9.9k): Assign Relief (date 5 Nov) fails every time with UPSTREAM_TIMEOUT (refs 408b880f…, 1abd04ed…, 30171e0e…). Other reads (timetable, suspended/Stapler) work.
- Apps Script Executions show a doPost of 30.8 s at 15:59:05 (likely the Assign Relief read); the Worker limit is about 30 s.
- Owner rolled the Roster backend back to Version 59 (v0.9.9i) with v0.9.9k Pages/Workers/Deploy/Venues: Assign Relief loads.
- Changes between v0.9.9i (2520ff1) and v0.9.9k touching the Assign Relief read: #73 daily relief cap (heldReliefPeriods per candidate), #74 consecutive counting, #68 acknowledgement continuity (snapshot/notice helpers), #64 peer override, #71 audit guard, #75 repair projection, #65 home duty cache.

## Ask
1. Measure the Assign Relief `read` (and its candidates/eligibility build) on v0.9.9i vs v0.9.9k with a production-sized fixture (about 19M characters operations, 3,600+ audit rows, a full staff list, 17 periods). Report time per phase and the top offenders with code lines.
2. Fix the regression so the v0.9.9k read is no slower than v0.9.9i (target: under 15 s at production size). Prefer caching per read (per-teacher sets computed once, Maps instead of repeated scans of audit/outbox/acknowledgements).
3. Add a performance regression test at production size that fails if the read exceeds the v0.9.9i baseline by more than 20%.
No behaviour change. Full suite green. Draft PR with exact head for Claude.
