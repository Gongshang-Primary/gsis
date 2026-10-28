# Install GSiS 0.9.8f
Baseline E. No migration or new infrastructure. Keep the existing properties, URLs, secrets, bindings and cron.

1. Preserve E Roster backend/Pages and D notification Worker for rollback.
2. In the existing Roster Apps Script project replace combined code with Roster_Backend_v0.9.8f.gs, save, then Deploy > Manage deployments > pencil > New version > Deploy. Keep the existing web-app URL.
3. In the existing gsis-roster-notifications Worker, replace code with Roster_Notification_Worker_v0.9.8f.txt and deploy. Keep current secrets/bindings/triggers.
4. Upload the inner Roster_Frontend_v0.9.8f.zip to the existing Roster Pages project. Refresh and check F in the header.
5. Select a confirmed suspended date. Search for a teacher, including those unavailable. Blocked teachers show reasons and disabled controls. R/cap/daily/consecutive workload checks do not apply on confirmed suspended dates; actual occupied periods, absences, existing relief and identity rules remain.
6. Publish current valid cover even with unresolved choices or unfilled lessons. Check the published/skipped/uncovered result. Invalid saved SMC choices stay for review, without becoming published duties.

Suspended workload changes no longer adjust ordinary baseline day caps. Duty history and reported workload values remain; they are not erased. Normal timetable dates keep existing workload policy. Blank-subject tiles remain occupied until corrected or removed; they cannot verify an actual free period.

No live records were changed and no messages sent during packaging. LORD and other viewports retain their existing versions. Roll back the matched Roster components to their preserved versions if needed. Code rollback does not undo saved records or submitted messages.
