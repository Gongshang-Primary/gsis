GSiS v0.8.1d: updated deployment component only
Required installed baseline: GSiS v0.8.1c.

Upload Roster_Frontend_v0.8.1d.zip to the EXISTING Roster Cloudflare Pages project, then reload the page. This is a complete Roster frontend replacement. Keep the existing project, domain, environment bindings and public private-link routes.

Retain Deploy backend v0.8.1c and the separate notification Worker v0.8.1b. Calendar, Contacts, Deploy frontend and Layout remain at their existing versions. If v0.8.1c has not been installed, install its required components first; this frontend-only package does not contain its backend fixes.

Item 060 keeps a valid teacher timetable link reusable. Opening, refreshing, bookmarking, copying the current URL into another browser and acknowledging the timetable no longer depend on this tab retaining session storage. The signed token stays in the URL fragment. Treat the complete link as private and do not forward it. No school sign-in is added.

The existing validity period remains the earlier of seven days after issue or 23:59:59 Singapore time on the day after the timetable date. Opening or acknowledging does not extend this period. Expired links remain expired. Acknowledgement is a separate, idempotent record.

After installation, reopen an existing valid private link before and after acknowledgement, refresh it, and open that same complete link in a fresh browser context. Confirm the same teacher and date remain visible, acknowledgement is retained and an expired link shows its actual error. An older tab whose URL was already stripped can recover its saved token if that tab still has its session storage; otherwise open the original complete notification link.

This package was prepared locally. No production deployment, live data update or WhatsApp send was performed. CHANGELOG.md records the patch, VALIDATION.md records verification and SUITE_MERGE.md carries cumulative suite integration notes.
