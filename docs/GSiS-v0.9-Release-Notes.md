# GSiS Suite v0.9

Release date: 24 October 2026, Singapore time. Authorised source release; no live deployment or staff messages.

All eight apps use release label **v0.9**: LORD, OVERLORD, STARLORD, Layout, Deploy, Roster, Calendar and Contacts. npm metadata uses its required semantic form `0.9.0`. Storage schemas, cache namespaces, request protocols and approved WhatsApp template names keep their independent compatibility identifiers. The LORD apps succeed standalone v1.8.1; this does not downgrade data.

## Included

* LORD owns a verified local copy of staff TTb names, contact details, published classes, subjects and TG names. Independent Contacts and published Deploy keys avoid reloading unchanged directories. Complete snapshots switch atomically; failed checks retain the last valid copy. Staff and class identities preserve history across renames.
* Roster protects human relief decisions against auto allocation, shows named conflicting editors and audit choices, and displays allocator progress with Minimise and cooperative Cancel. Exact retry and cancellation receipts survive uncertain responses and reloads.
* STAPLER keeps pending commands durably, separates historical receipt acceptance from current plan state, validates the changed scope when the revision matches, and preserves scroll and unchanged screen content after Save/Confirm.
* Trusted timetable window markers avoid reloading today through 30 days ahead after unrelated dated edits. Changed or incomplete relevant data still refreshes.
* The package includes the complete current WhatsApp parameter reference and the intended Report Absence menu destination `https://roster.gsps.edu.sg/`. Uploading source does not change a live environment variable.
* The existing separate venue register is retained. The future `venues.gsps.edu.sg` pipeline is logged with Roster occupancy, timetable display, range selection, a Singapore-time vertical Now indicator, stable room identities and separate booking storage.

## Install carefully

Read `GSiS-v0.9-Maintainer-Guide.md` and `LORD_SETUP_v0.9.md` first. LORD source is clean configuration template code. Carry forward existing private settings, file IDs, booking peppers and Worker constants before uploading. The new dedicated LORD reference bridge secret must match in Contacts, Deploy and LORD; keep other secrets unchanged. Install the updated source endpoints before enabling the LORD background checker.

No additional venue spreadsheet is created for v0.9. A future booking store will be separate from published timetables and Layout snapshots.

## Verification and limits

Fresh verification passed all 636 GSiS programs, the separate full-package gate and all 23 LORD programs, including real browser and signed cross-app checks. The build passed the ES2020 gate for 134 Apps Script sources. The 23-member installation package passed runtime byte parity, hashes, version labels and offline guide checks. Details are recorded in source `VALIDATION.md`. The package is verified again after commit so its source identity matches the release tag.

Local regression and browser checks do not establish production morning throughput or provider delivery. LORD does not share an upstream transaction across Contacts and Deploy. Failed or older-than-five-minute Contacts verification defers new LORD WhatsApp sends. Roster still commits its operations document under its authoritative writer lock. Manual and automatic calendar/provider cooldown work, automatic new-absence alerts after first publication and before 14:00, and targeted affected-teacher publication notifications remain separate queued work.

## Committed correction — settings and Report Absence

The following correction is committed separately under Git tag `v0.9-correction`, preserving the original `v0.9` tag and visible app versions. No live deployment is included. The original release facts and verification above describe the original release; current correction validation is recorded separately in source `VALIDATION.md`. See [GSiS-v0.9-Settings-and-Absence-Correction.md](GSiS-v0.9-Settings-and-Absence-Correction.md) for its scope and installation instructions.

* LORD installation values move into Apps Script Properties and Cloudflare Pages Variables and Secrets. Create or preserve those settings before saving the clean source. For this correction, [LORD_SETUP_v0.9.md](LORD_SETUP_v0.9.md) supersedes the earlier instruction to restore Worker constants; keep the private ledger outside source and upload ZIPs.
* Report Absence restores **Periods and timings**, the review action **I'm not available during the above selected periods**, and the final **Submit absence** button. The review action stays local until an explicit save action.
* Report Absence keeps save feedback immediately above **Relief instructions**: neutral while pending, red for errors and green after confirmation. Confirmed feedback remains visible through routine page updates. Colleague availability loads only when **Own arrangements** opens.
* **Own arrangements** restores the full-day table: the selected absent teacher first, colleagues below, matching period columns and a partial-name filter. Select an absent lesson, then an eligible blank slot for cover or occupied class for Combine. The existing candidate request supplies the permitted grid without an extra API or model read; server eligibility checks remain in force. Ordinary teachers must wait for timetable confirmation when STAPLER planning and confirmed/published sources differ; their absence stays saved.
* SMC and administrators can select several **Absent teacher(s)** with the same searchable picker as Check Availability. Ordinary teachers remain self-only. Shared absence details and separate teacher/date instructions are validated together and saved as one batch, with no partial save if any selected entry fails validation.
* Manage school-wide absences offers **50**, **100**, **150** or **200** rows per page, defaulting to **50**. Changing page size retains the date range, search, sort and cross-page selections; mass deletion still uses the full selected set of eligible records.
* Absence preparation skips a duplicate notification-delivery read and filters STAPLER to relevant timetable weeks before packing its preparation proof. The commit retains its current-state checks and complete durable save; exact receipt recovery is unchanged. These changes reduce verified local work without claiming a production response time.

The correction retains the v0.9 label and requires matching generated backend and frontend files. It does not change live settings, deploy code or send staff messages as part of source preparation.
