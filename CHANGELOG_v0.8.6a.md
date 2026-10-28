# GSiS v0.8.6a Roster patch

Baseline: v0.8.6. Scope: item 115 and preservation of the installed item 114 receipt filter.

A name-only change advanced a legacy suspended timetable record's timestamp and revision, causing the teacher view to lose access despite Assign Relief still using the saved plan. The patch recovers a confirmed plan from a unique matching confirmation and complete rename-only audit chain. Future renames and saves retain the confirmed snapshot. Teacher views and compressed preload share the same rule. Missing proof produces reconfirmation guidance; unconfirmed lesson edits remain private.

The 22 October EL EYE record recovers confirmed revision 1 from metadata revision 2. Local reproduction from operations revision 294 returned 104 timetable rows without altering the data. No live data was changed.

The Roster backend also retains the installed exact-fingerprint adminReviewReceipt filter. Previously emailed and cleared alerts stay closed; materially changed failures reopen. Full automatic email settlement remains queued. Items 112 and 113 are not included.

## Install

1. Replace the main code in the existing Roster Apps Script project with Roster_Backend_v0.8.6a.gs.
2. Save, then edit the existing Roster web app deployment to use a new version; retain its URL, properties and triggers.
3. Upload Roster_Frontend_v0.8.6a.zip to the existing Roster Pages project.
4. Reload Roster, open Timetable, select 22 October and verify the confirmed suspended timetable.

This patch requires no Deploy, Contacts, Calendar, Layout or notification Worker update. No publication or WhatsApp sending is part of installation.

## Verification

Passed: seven domain recovery checks; exact receipt suppression and changed-outcome reopening; twelve confirmed-view checks; confirmed-preview isolation; twenty-one compressed batch backend checks; batch client checks; lifecycle domain and durable compressed persistence/replay; existing delivery-review checks; native Chromium confirmation UI checks; desktop/mobile confirmed-date list checks. All 93 Apps Script files parse. The package verifier checks exact two-component membership, source parity, required assets, role/version metadata and SHA-256 hashes.

The reproduction tests failed on the original code before the fix. Independent Thermonuclear correctness and quality reviews plus Vercel-style contract checks found no remaining material finding in the inspected scope. A packaging compatibility finding was corrected by preserving the prior default component list.

The build does not establish live deployment acceptance or WhatsApp provider delivery. No school data writes or messages were made.

## Rebuild and future merge

Run python3 scripts/build-component-patch.py. gsisPatchClean puts only the two deployables into the ZIP, with the source commit, component versions and hashes in the archive comment. The full source history is retained separately. Merge canonical sources and tests, not only generated gCode. Preserve the receipt filter and single-writer Roster ownership.
