# Codex build queue from 30 Oct 2026 (owner go: all logged items)

Owner (Song Wee, 30 Oct): "it can be all, let codex work while i teach". Claude reviews every PR at its exact head; owner merges and deploys. Work top to bottom, at most two open PRs at a time. Each task file holds its own background.

| # | Task file | Notes |
|---|---|---|
| 1 | roster-relief-auto-complete.md | R% shows 0 for everyone today |
| 2 | (new) roster-assigned-by-label | PENDING_CHANGELOG "Assigned By shows the auto-allocator" |
| 2b | roster-sre-daily-priority.md | Business rule: SRE priority 1; limits from the existing Daily workload limits settings; no new setting |
| 2c | roster-fajt-levelling.md | After SRE: FAJT as a group before other staff, levelled among themselves by R% |
| 3 | roster-excel-relief-for-absent.md | Report Absence → Export Excel |
| 4 | (new) roster-reminder-cheap-check | Skip the full operations read on published days until the next reminder is due (Claude note 2 on PR #7) |
| 5 | (new) roster-delivery-time-format | PENDING_CHANGELOG "delivery time shows a raw number" |
| 6 | (new) roster-published-time-chip | PENDING_CHANGELOG, time only, no publisher |
| 7 | lord-queued-writes.md phase 1 | Queue and status list, no UI change |
| 8 | lord-queued-writes.md phase 2 | Book cart, open/collect, collect photos, return, return photos |
| 8b | deploy-queued-writes.md | Same queue as LORD; keep clash detection and who-did-what notices |
| 9 | calendar-099a-save-flow.md | Instant save, weekly view, year overlay, venue chips (max 6) |
| 10 | (new) roster-stapler-all-dates | Owner decisions 1 and 2 under Annual R% in PENDING_CHANGELOG |
| 11 | (new) roster-peer-release-notify | Owner decision 3 |
| 12 | (new) roster-my-relief-r-percent | Owner decision 4 |
| 13 | (new) roster-suspended-baseline-view | PENDING_CHANGELOG |
| 14 | (new) roster-relief-on-timetable | Relief overlay on the teacher's day timetable |
| 15 | (new) deploy-specialist-count-fajt | PENDING_CHANGELOG owner decision |
| 16 | (new) roster-d1-google-backup | Copy each D1 change back to Google before any D1 switch |
| 17 | lord-queued-writes.md phase 3 | OVERLORD/STARLORD after a week of phase 2 without double bookings |

Rules: create the task file for a "(new)" row before claiming; keep Google authoritative; no ROSTER_EDGE_AUTHORITY change; regenerate bundles; run the full suite before asking for merge.
