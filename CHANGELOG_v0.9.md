# GSiS Suite v0.9

24 October 2026, Singapore time. All eight applications use the v0.9 release label: LORD, OVERLORD, STARLORD, Layout, Deploy, Roster, Calendar and Contacts. The npm package uses 0.9.0. Independent storage schemas, request protocols and migration identifiers retain their existing versions.

## Committed correction: settings and Report Absence

24 October 2026. This source correction follows committed v0.9 (`c6ee479e72c5f9d120d86173093b658e6b9e3795`) and is identified by the separate Git tag `v0.9-correction`. The original `v0.9` tag remains unchanged. All visible app versions and storage schemas remain unchanged; no live deployment is included.

* LORD's nine installation settings now come from Apps Script Properties. LORD, OVERLORD and STARLORD Workers use `LORD_BACKEND_URL` and encrypted `LORD_PROXY_SECRET` bindings. Missing settings fail safely. Existing booking peppers retain their exact bytes, and legacy property cleanup protects the new settings.
* A separate private ledger records the existing supplied values and where they belong. Runtime files, frontend ZIPs and general documentation contain no restored credentials. Set project settings before replacing saved Apps Script source or uploading Pages assets. This supersedes the earlier configured LORD ZIP and the original release's placeholder instructions below.
* Report Absence restores **Periods and timings**, the first button **I'm not available during the above selected periods**, and final **Submit absence**. The first button reviews locally. When no real timing grid exists, full-day or clock coverage remains available without inventing periods.
* **Absent teacher(s)** shares Check Availability's searchable removable chips. SMC/admin can submit a common absence selection for several teachers; ordinary teachers retain self-only permissions. Instructions remain separate by teacher and date.
* Own arrangements restores the full-day timetable table from before v0.8.4: absent teacher first, colleagues below, shared period columns and partial-name search. Choose an absent lesson, then a blank eligible colleague cell for relief or an occupied eligible cell for combination. One validated availability response provides the grid. Ordinary teachers cannot view later unconfirmed colleague edits; the saved absence is retained while awaiting timetable confirmation.
* Manage school-wide absences has a Show 50 / 100 / 150 / 200 page-size selector, defaulting to 50 while preserving the date range and selected records.
* Report Absence shows persistent outcome feedback immediately above Relief instructions. Saving remains neutral; green indicates an accepted save. Own arrangements loads colleague choices only when opened. Submission avoids a duplicate delivery-state read and excludes unrelated STAPLER plans from its preparation fingerprint while retaining the fresh locked commit.
* Compact Report Absence reads also retain a single explicitly selected teacher on confirmed STAPLER days; ordinary teachers remain self-only. The correction suite uses a distinct Git tag and archive name, and includes both the correction guide and `READ_FIRST.md`.
* Every selected teacher/date is validated before one durable save and retry receipt. Any validation failure saves none of the new batch. Limits are 150 teachers and 300 teacher/date records. Existing record edits remain scoped to one teacher; exact lost-response recovery prevents duplicates.

See [the correction guide](docs/GSiS-v0.9-Settings-and-Absence-Correction.md) and the current verification record. Install the matching Roster backend before the frontend and reload open tabs. No school data, platform settings or external messages were changed during preparation.

## Included changes

* LORD keeps its own validated TTb names, contact details, class names, subject names and TG names. Separate Contacts and published Deploy version checks download only changed source content. Unpublished Deploy edits do not invalidate the published reference copy.
* Private immutable reference snapshots use a fenced pointer switch. Failed reads retain the last complete generation. New WhatsApp sends require current Contacts verification.
* Stable identities protect booking ownership and notification recipients through staff renames and reused TTb names. Existing booking labels, custom activities and custody history remain intact. Exact retries recover committed work after a lost response.
* STAPLER uses changed-content validation when the saved revision matches. Compact confirmation responses preserve accepted content and screen position. Durable pending requests use less browser storage and retain exact retry identity.
* Roster's trusted today-through-30-days markers avoid reloading full timetables after unrelated date edits. IndexedDB updates follow the checked content generation. Explicit Refresh remains fresh.
* Active Assign Relief screens show automatic allocation progress, Minimise and cooperative Cancel. Manual Auto-allocate opens its log. Durable cancellation receipts and final write checks prevent cancelled or obsolete attempts from committing.
* Human relief decisions remain authoritative over automatic allocation. Conflicting human edits show editor attribution and record the selected audit choice. The latest server-accepted human decision remains until an explicit replacement passes current checks.
* The full package includes eight frontends, five complete backends, one Roster notification Worker, current setup guides and the complete WhatsApp parameter reference.
* Current instructions use `https://roster.gsps.edu.sg/` for the Report Absence menu through `WHATSAPP_CURRENT_RELIEF_URL`. Installing code does not change a live environment variable.

The reviewed v0.8.11 and v0.8.11a changes remain included, including the Deploy ASC Export scroll repair and separator before Audit.

## Venue storage and future work

A separate physical `Venues` register already exists. Layout also stores year-specific `layout_venues` rows. No further split is needed for v0.9 or LORD reference integration.

The recorded future `venues.gsps.edu.sg` application will use Roster timetable occupancy and draw on its timetable navigation, range selection and vertical Now indicator. Physical venue identities must survive class renames. A future booking store must own atomic conflict checks, receipts and booking history. This release does not build or activate that application. See [the pipeline record](docs/reviews/v09/venues-pipeline.md).

## Installation and verification

Use the [maintainer guide](docs/GSiS-v0.9-Maintainer-Guide.md), [LORD setup guide](docs/LORD_SETUP_v0.9.md) and [WhatsApp parameter reference](docs/WHATSAPP_PARAMETERS.md). Save existing LORD private values in Apps Script Properties and Cloudflare Pages bindings before saving or uploading the clean code. Preserve existing IDs, secrets, booking peppers and writer ownership. Install Contacts and Deploy endpoints before activating the LORD bridge.

Final release verification and the commit identity are recorded by the release process in `VALIDATION.md` and `docs/GSiS-v0.9-Release-Notes.md`. This changelog does not treat earlier draft test results as the final release gate. No live deployment, source activation, timetable publication or provider message is performed by this commit.

Automatic emergency notices for new absences after first publication and before 14:00, targeted publication follow-ups, and expanded Calendar cooldown remain separate queued requirements.
