# GSiS v0.7.03 changes

Finalised on 15 October 2026 from the preserved v0.7.02 deployment package. The release contains matching source and installation packages. Finalisation does not deploy live services or create a Git commit.

## Roster

- Keep complete immutable timetable models and shared name indexes in browser memory, with up to eight models retained across dates and views. Warm timetable selection uses local data. Date context expires after 60 seconds, while logout or account changes clear the cache.
- Prepare colleague availability for all affected periods in one request. The matrix opens with its loaded timetable, then uses local period selection, target selection and name filtering. Click your period, click the colleague's cell, then use Submit requests. Submission and acceptance still validate current server availability.
- Remove Remarks from absence forms, details, tables and new payloads. Existing stored remarks survive edits that omit the field. Relief required = No creates no relief demand.
- Show one centred progress overlay with a spinner and blurred backdrop. Results and errors remain visible without scrolling to the page header.
- Keep search, sorting, read-only details and the three-dot menu usable while a previous save awaits confirmation. Block further mutations until that confirmation resolves. Retry uses the exact original request ID and payload.
- Preserve editable drafts on definite revision conflicts, refresh the authoritative revision and require review before resubmission. A failed refresh blocks another write. Confirming an older save refreshes the currently selected page and date.
- Clear stale Availability results when selection changes. Ignore late responses from another session. Refresh a rotated Google signing key once without weakening token verification.
- Batch up to 62 Calendar dates in one request. Persist diagnostic phase metadata at terminal success or failure instead of at every intermediate phase.

## Contacts and Deploy

Contacts filters retain the focused input and column chooser. Delayed teaching-data loads preserve unrelated editors and signature choices. Refresh retains the signature comparison revision until the user reviews a conflict. Late results cannot replace another account's state.

Deploy assignment ordering builds one class/group index per operation. The established order and object identities stay the same. Existing surgical writes, journals, commit markers and request receipts remain in place.

## Calendar and Layout

Calendar coalesces concurrent reads for the selected year and ignores obsolete responses. Cold bootstrap batches missing metadata. Lane, schedule and audit writes use one atomic batch. Tag and audit writes also commit together. Optional sorting cannot turn a completed save into an apparent failure. Metadata caches invalidate after the transaction attempt, including a lost acknowledgement.

Layout's existing coalesced public reads, local row filters and verified immutable publication protocol were reviewed and retained.

## Installation and verification

Install the matching Calendar backend in its existing deployment before the updated Roster frontend Worker. The new Worker needs `rosterDates` for multi-date operations. Preserve all existing URLs, secrets, data and execution identities. See DEPLOYMENT.md.

The integrated source check passed 277 Node scripts and five Chromium scenarios with synthetic data. Pstack review found and verified a Calendar cache race correction. Ponytail review found no justified additional abstractions. Final package verification is recorded in RELEASE_SUMMARY.json and VALIDATION.md.

The exact public privacy page and its images are preserved. WhatsApp and automation remain paused. No live message, live deployment or confirmed absence deletion is included in this release. The earlier intermittent production startup failure still needs its matching diagnostic record. Local tests do not certify production network reliability.
