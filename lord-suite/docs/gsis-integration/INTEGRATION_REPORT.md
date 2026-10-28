# GSiS Suite v0.9.1: retained LORD integration

24 October 2026. The Roster/STAPLER code review was completed and its improvement methods recorded before this integration began. The integration first shipped in GSiS Suite v0.9 and remains included in v0.9.1, with core runtime configuration now supplied through platform settings. Live deployment and bridge activation are separate steps.

## What changes

LORD holds its own complete reference snapshot of Contacts TTb names, verified school/notification email addresses, contact numbers and active state, plus Deploy classes, subjects and teaching groups. Normal reference, identity, booking and dashboard reads use this LORD-owned copy. The existing inventory, period definitions, administrator rights, booking/custody records and notification configuration stay within LORD.

A one-minute background checker requests two small signed source manifests. Matching keys reuse the stored component; changed keys download only that component. Deploy keys identify its frozen published version, so editing an unpublished planning version does not force a reference reload. Contacts uses an independent fresh projection digest, so a phone, TTb or role-derived name edit is detected even without a Deploy publication or script epoch change. The UI shows publication name/revision, source update time and last check. Contacts observation time is not presented as an exact edit time.

Snapshots are staged as immutable JSON in a private LORD folder and published through one fenced pointer. Network calls run outside the shared writer lock. A short sync lease and final pointer/attempt checks prevent a slow old refresh from replacing newer data or status. A failed/partial read retains the last valid generation. Malformed optional cache bytes fall back to the validated durable copy. New provider sends recheck current enable mode, snapshot pointer and Contacts freshness.

A measured 100-row dashboard fixture reduces repeated settings reads from 101 to one and email-field accesses from 20,100 to 200 by reusing per-execution indexes. The provider send gate still checks live state. These are local work counts, not production latency claims.

## Renames and history

The live read-only comparison found published `2026 T4 post-PSLE` revision 8 with 40 classes, and unpublished `2027 Term 1` revision 267 with 59. P changes from Perseverance to Prudence. The published configuration already contains old and new naming presets; the bridge therefore uses actual published class rows, not every preset or the newest draft.

Forms use Staff IDs, stable class refs, TG IDs and existing subject codes, with distinct class/group/activity namespaces. An open form keeps the generation it showed. New publication or directory changes require explicit refresh/review before a new command can reinterpret a selection. Custom student groups and activity purposes remain available, including saved drafts and administrator edits. Existing booking/session labels are not renamed retroactively.

Verified owner identity, rather than a historical name string, controls recipient lookup. A renamed staff member keeps their booking association; someone who later takes the old TTb name does not receive that booking. New bookings record reference identity metadata alongside the atomic booking commit. If the response or receipt write is lost, an exact retry checks the original committed command before applying current reference-generation validation. Altered commands cannot reuse that acceptance.

The supplied LORD reference list has 102 labels: 40 form classes and 62 other teaching/activity entries. The migration regression uses this exact list and verifies form-class replacement and retention of the other entries. TG shape and linkage tests use synthetic fixtures; no claim is made that a live LORD cache has already been populated.

## Review and verification

The original integration reviews are retained in `CORRECTNESS_REVIEW.md`, `QUALITY_REVIEW.md`, `BACKEND.md`, `UI_REVIEW.md` and the GSiS source-endpoint report. Their dated test counts describe v0.9 integration work, not a fresh v0.9.1 run. `VERIFICATION.md` and `RELEASE_v0.9.md` likewise remain historical evidence.

Fresh v0.9.1 results are recorded in the enclosing suite's `VALIDATION.md`. Current LORD source reads installation settings from Apps Script Properties and Cloudflare Pages bindings. Preserve existing settings before saving source; do not restore private values into runtime files. The private ledger remains outside source and deployment archives. See `SETUP.md` for the current settings-first upgrade path.

## Operational limits

This work verifies local source behavior, not live Google throughput, trigger timing or WhatsApp delivery. The source snapshots represent two independently checked services; they are not a distributed transaction across Contacts and Deploy. Direct manual Sheet edits are discovered by fresh reads, but arbitrary simultaneous manual edits do not acquire application transaction markers.

An unchanged check still performs scoped source verification. A known failed check or Contacts verification older than five minutes defers a new WhatsApp provider send until a successful check. The published pointer remains authoritative even for an explicitly published future-dated version; a date-range warning is shown and no unpublished substitute is selected. Subject codes do not have a separate immutable UUID or automatic rename alias.

LORD snapshot files are retained for uncertain-write recovery; no automatic old-file deletion is added. Installation requires the updated source deployments, the dedicated bridge secret, source URLs, a private snapshot folder and explicit bridge activation. See `SETUP.md`. No live deployment, configuration change, record edit or staff message was performed.
