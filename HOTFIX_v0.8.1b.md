GSiS v0.8.1b: updated deployment components only
Baseline: GSiS v0.8.1 or v0.8.1a. This patch includes v0.8.1a.

Install these three complete components in order:

1. Deploy_Backend_v0.8.1b.gs: replace the complete code in the EXISTING Deploy Apps Script project, save, then update its existing web app deployment to a new version. Keep its URL, properties, workbook and triggers.
2. Roster_Notification_Worker_v0.8.1b.txt: replace the complete code in the EXISTING gsis-roster-notifications Cloudflare Worker and deploy. Keep its secrets, bindings, variables and scheduled trigger.
3. Roster_Frontend_v0.8.1b.zip: upload this ZIP to the EXISTING Roster Cloudflare Pages project. Reload Roster after deployment.

Calendar, Contacts, Deploy frontend and Layout do not require redeployment for this patch. Do not reset existing data or configuration. Configured subject-family and teaching-group exceptions persist across subsequent deployments.

The private timetable page uses a signed link and does not require a Google account. A link stops working at the earlier of seven days after issue or 23:59:59 Singapore time on the day after its timetable date. For a 21 October timetable link issued on 20 October, expiry is 22 October at 23:59:59 Singapore time. Expiry does not erase audit records. If a separate Cloudflare Access policy protects the whole hostname, the public /external.html, /external.js, /external.css and /api/external routes must be reachable; the API still checks the signed capability. This package cannot change an external Access policy.

After installation, refresh the published date in Daily Notify. Test one individual Notify to yourself, open the received private link in a browser without a school sign-in, acknowledge the displayed timetable, then refresh Daily Notify to check its status. Publish Only still sends nothing. An unchanged resend keeps acknowledgement; a changed published timetable or instruction requires a new acknowledgement.

Existing approved template names, languages and fixed bodies are retained. Dynamic parameters are encoded safely. The timetable template's fixed wording still says 'today'; its dated parameter identifies the selected day. A new fixed template body requires separate provider approval.

This package was prepared locally. Installation, live provider delivery and any hostname-wide Access configuration are not claimed as tested in production. No staff messages or live template edits were made during this build. See CHANGELOG.md for the implemented scope and final local validation evidence.
