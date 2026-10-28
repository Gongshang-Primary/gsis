# GSiS v0.9.1c installation

These complete Roster files supersede the Roster uploads in v0.9.1b for the existing v0.9.1 installation. If that patch is not installed yet, use these files for Roster and the v0.9.1b files for LORD; there is no need to upload the v0.9.1b Roster files first. Preserve all existing Script Properties, URLs, secrets, Pages bindings and Worker schedules.

1. Back up the saved Roster Apps Script source and record the current web-app and Pages deployments.
2. Replace the Roster combined backend with Roster_Backend_v0.9.1c.gs. This file is for the Roster Apps Script project, not Deploy.
3. Publish a new version of the existing Roster web-app deployment, keeping its execution identity, access settings and /exec URL.
4. Upload Roster_Frontend_v0.9.1c.zip to the existing Roster Cloudflare Pages project.
5. Replace the existing notification Worker with Roster_Notification_Worker_v0.9.1c.txt, preserving its bindings, settings and schedules.
6. Reload open Roster tabs. Verify a full-year absence on a nonproduction copy, including selected teachers, periods, save confirmation and subsequent readback.

No new setting, binding, service, worksheet or trigger is required by this patch. LORD components remain at v0.9.1b and are not included. Existing Calendar configuration must cover the selected dates; extending the range does not create a missing school year or fabricate timetable data.

For rollback, restore both saved Apps Script source and the prior published deployment, plus the matching Pages and Worker releases. Keep saved absence records and valid retry receipts. Saved source affects triggers immediately.

This package does not deploy Venues. Its reviewed requirements are available in the source recovery files. The separate product backlog remains outside Git and this archive.
