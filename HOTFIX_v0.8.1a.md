GSiS v0.8.1a: updated deployments only
Baseline: the supplied GSiS v0.8.1 deployment.

Install these three items in this order:
1. Deploy_Backend_v0.8.1a.gs: replace the complete code in the EXISTING Deploy Apps Script project, save, then update its existing web app deployment to a new version. Keep its URL, project properties and triggers.
2. Roster_Notification_Worker_v0.8.1a.txt: replace the complete code in the EXISTING gsis-roster-notifications Cloudflare Worker and deploy. Keep its secrets, variables and scheduled trigger.
3. Roster_Frontend_v0.8.1a.zip: upload this ZIP to the EXISTING Roster Cloudflare Pages project. Reload Roster after deployment.

Changes:
Daily Notify shows an inline loading spinner and text, with inline Retry on read failure. Date navigation and other pages remain usable.
Publishing a current or future day makes the published timetable eligible for individual and bulk notices immediately. Advance publication still requires the existing Admin setting. Publish Only sends nothing. Pending drafts are excluded.
Morning reminder checks recognise advance publication while retaining their scheduled time windows.
Daily Notify omits duplicate unused payload fields and reuses summary cards/search indices in browser memory. The view cache retains 24 recent date/page results. Existing 60-second freshness, permission checks, revision checks and save conflict protection remain.

Only these deployment items change. No workbook migration or configuration reset is needed. No production deployment or WhatsApp message was performed during preparation.

After installing, select the published 21 Oct timetable in Daily Notify, refresh records, and use an individual Notify action to check delivery. If publication already succeeded, republishing is not required unless the timetable changed.

The existing approved WhatsApp template still contains the word 'today'. Each notice includes its selected date. Changing the fixed wording requires a separate template update; this patch preserves the existing approved template contract.

Validation evidence is retained in the working source. Local tests use synthetic data and mocked external services; they do not establish live provider delivery or production response time.
