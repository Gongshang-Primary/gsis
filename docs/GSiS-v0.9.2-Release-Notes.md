# GSiS Suite v0.9.2 release notes

25 October 2026, Singapore. This full release consolidates v0.9.1 and its a/b/c patches, adds Venues, and aligns all nine frontends, six Apps Script backends and the Roster notification Worker to 0.9.2. The main README is the single installation and maintenance authority. Source, package and local validation are separate from live deployment.

## Included behaviour

1. Venues provides timetable-aware room booking, repeating requests, preparation notes, transfers, My bookings and a multi-room dashboard.
2. Venue owners/admins control room policy and decisions; only product admins grant owners, and current server permissions apply on each mutation.
3. Venues has its own Apps Script, spreadsheet, audit, receipts and outbox, with signed Roster source coordination and verified compressed client occupancy.
4. Roster full-year absence reporting permits 366 inclusive days and keeps atomic multi-teacher validation, dated instructions and bounded Calendar transport.
5. STAPLER draft recovery uses asynchronous browser storage and makes recovery failures explicit without disguising an online save result.
6. A known UT weekly cap remains visible when quota verification is unavailable.
7. LORD retains custom booking fields, corrected remarks spacing, faster form opening, evidence-upload recovery and revised return controls.
8. OVERLORD retains useful background-task diagnostics; STARLORD retains stalled-read recovery.
9. Private Roster timetable pages retain early loading and prominent maroon acknowledgement that becomes green after confirmed success.
10. Existing human allocation protection, conflict attribution, local timetable cache, published-source references and provider contracts remain included.

## Setup and limits

Install the matching backend/frontend pairs and preserve existing secrets, peppers, IDs and sole-writer ownership. LORD photo evidence requires Drive v3. New Venues setup requires its own Sheets/Drive resources, source endpoints, proxy/service settings, initial administrators and one minute trigger. Publish the Contacts Venues source endpoint and bridge key before `setupVenues()`, because initial administrator grants resolve live Contacts identities. Rerun interrupted setup with existing resource IDs. Enable Roster coordination only after the Venues endpoint is ready; run Roster recovery and Venues sync, then verify per-date coverage before accepting bookings. Unknown room aliases remain visibly uncovered until an administrator fixes the mapping. Normal staff sign-in uses Google OAuth; verified Cloudflare Access is optional.

The Venues bridge introduces a deliberate availability dependency: an occupancy-changing Roster commit cannot proceed if its required source-fence acknowledgement is unavailable. Verified recovery is required; do not clear pending state by age or remove just one coordination setting.

Provider settings and exact template approval remain deployment requirements. A local check cannot prove a Cloudflare binding, current Meta approval, email delivery or school production latency. No live settings, messages, timetable publication, DNS or deployment were changed while preparing the release.

The complete current-source ZIP is the maintenance authority. The incremental Git bundle requires the stated v0.9.1c baseline and excludes earlier history that may contain retired configuration values. The unpromoted product backlog remains outside Git and deployment archives.

## Validation status

All 666 current GSiS programs have passing results across the full run and three focused follow-ups. The initial run passed 663; two legacy harness assumptions were corrected without runtime changes, and the archive metadata gate passed after rebuilding at the current commit. LORD passed all 33 programs. The build parsed 156 Apps Script sources and the package gate verified all 23 declared installation/document files, exact source parity and hashes. See `VALIDATION_v0.9.2.md` in the source ZIP for the execution record and limits.

The final tagged archive is rebuilt and checked again before delivery. Local tests do not establish live delivery, production quota headroom or measured school-day latency.
