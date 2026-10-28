# Venues setup and published date coverage

Keep the existing Venues execution account, workbook, snapshot folder, deployment URLs, secrets, grants and minute trigger when upgrading. The date-effective publication change requires no new secret, Script Property, Cloudflare binding or trigger. Install the matching Deploy, Roster and Venues backends and Venues frontend together so their source contracts agree.

`VENUES_SCHOOL_YEAR` is no longer read or required. Leave an existing value untouched; do not create it for a new installation or change it annually. Keep `VENUES_PUBLIC_URL` set to the Venues origin, normally `https://venues.gsps.edu.sg`.

The required Venues source connections remain `VENUES_ROSTER_APPS_SCRIPT_URL`, `VENUES_CONTACTS_APPS_SCRIPT_URL`, `VENUES_DEPLOY_APPS_SCRIPT_URL`, `VENUES_CALENDAR_APPS_SCRIPT_URL` and the shared `VENUES_BRIDGE_SECRET`. Preserve `VENUES_SPREADSHEET_ID`, `VENUES_SNAPSHOT_FOLDER_ID` and `VENUES_PROXY_SECRET`. `VENUES_ADMIN_EMAILS` is used only to create initial grants when no administrator grant exists; subsequent access changes use Venues administration. Notification provider settings are unchanged.

For a new installation, publish the Contacts source endpoint and configure its matching bridge key before running `setupVenues()`. Configure the remaining source endpoints, enable Sheets v4 and Drive v3, deploy the Venues web app and frontend, then enable Roster coordination with both `VENUES_APPS_SCRIPT_URL` and `VENUES_BRIDGE_SECRET`. Run `recoverRosterVenuesSource()` in Roster, then `syncVenuesSources()` and `venuesHealthCheck()` in Venues. Preserve managed fences and recovery markers.

## Enable current and future booking dates

1. Publish each applicable Deploy version with valid ISO effective start and end dates. Exactly one retained published version must cover a booking date. Editable drafts never supply booking authority.
2. Release the relevant Calendar year and confirm its date/parity data. An explicit holiday or weekend is valid coverage; an unknown or unreleased date is unavailable.
3. Confirm the Roster baseline covers those dates. Only confirmed suspended timetables and applicable published changes affect occupancy. Draft edits do not.
4. Run `syncVenuesSources()` and review the selected dates in Venues. Resolve ambiguous room aliases or publication windows before booking. A ready overall source does not mean every date is covered.

Publishing a future year retains the current year's immutable published reference. Venues selects the room register, room aliases and period grid for each booking date, so current and future years can be used together. Existing room and booking IDs, grants, audit history and conflict checks remain in place. Unchanged references and annual timetable pieces are reused; adding a future year does not require downloading unchanged current-year pieces again.

## Upgrade evidence and diagnostics

Publication retention supports at most 200 distinct published versions, with only the newest published snapshot of each version retained. Publishing another distinct version beyond that limit is rejected before any journal, field or index write; existing references are never silently dropped. The existing deployment-index size preflight can reject a smaller collection first. Republishing a retained version replaces its reference without consuming another slot.

The first new publication retains the known current immutable published pointer and the new publication. Subsequent publications retain the latest published snapshot for each version. Older pointers already discarded before this change cannot safely be recovered from editable drafts. If an older effective window is missing, review and explicitly publish the intended version with valid, non-overlapping dates; never treat a draft as previously published evidence.

No valid immutable publication means no bookable dates. Publication gaps and overlaps, missing Calendar/Roster coverage and unresolved aliases remain unavailable. Check the backend source error, the date grid, and administration's `mappingIssues`/`unresolvedAliases`; `AMBIGUOUS_PUBLICATION` identifies overlapping published windows. Correct the authoritative source and sync again. A legacy reference without immutable storage needs an explicit publication before it can authorise booking.

Do not clear a pending source fence, reset the browser, delete existing bookings or rotate a working secret to resolve missing date coverage. Follow the existing source or transaction recovery procedure when its durable marker is pending or uncertain.
