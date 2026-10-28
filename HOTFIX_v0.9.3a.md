# GSiS Roster v0.9.3a

Apply on top of GSiS v0.9.3. This package contains the complete Roster frontend and complete Roster Apps Script backend. It does not contain a new full suite deployment.

1. In the existing Roster Apps Script project, replace its combined backend code with `Roster_Backend_v0.9.3a.gs`. Save, then edit the existing web app deployment to use a new version. Keep its `/exec` URL and current execution/access settings.
2. Upload the contents of `Roster_Frontend_v0.9.3a.zip` to the existing Roster Cloudflare Pages project. Include `_worker.js` and `_routes.json` at the deployment root.
3. Reload Roster. Confirm its header shows v0.9.3a. Do not clear IndexedDB as an installation step; the existing immutable timetable cache is reused.

No new Apps Script properties, Cloudflare bindings, WhatsApp templates or permissions are required. Keep the existing Roster `APPS_SCRIPT_URL`, bridge secret, sign-in and Calendar bindings. Calendar and the other suite components remain at v0.9.3.

Report Absence shows its verified form metadata before waiting for lesson data. `Absent full day w/o relief instructions` submits full-day coverage with no instructions immediately through current server validation. The explicit period selector and final Submit absence button remain.

Own arrangements opens a filterable full-day timetable. Keep arrangements retains choices in the form; Submit absence saves the absence, instructions and peer requests together. Closing the chooser does not submit. A stale lesson or unavailable colleague rejects the batch and retains the draft for review. For an already saved absence, the chooser keeps its explicit Submit requests action.

Assign Relief marks affected periods as awaiting peer approval, with the requested colleague's name. Pending requests are not confirmed cover.

The main screen warms missing or expired dated context in the background. When dated cache data is verified, tomorrow's timetable can render before a remote report finishes. Unknown or expired Calendar context still needs checking. Cold cache and backend validation take network time; no claim is made that the observed production 26-second duration was reproduced locally.

The package also includes the changelog, validation record, exact source patch, checksums and an incremental Git bundle against v0.9.3 for maintainers. No production deployment was performed while preparing this release.
