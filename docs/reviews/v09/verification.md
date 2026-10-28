# GSiS Suite v0.9 verification

Authorised release: 24 October 2026, Singapore time. Baseline GSiS v0.8.11a, commit 8b0d350cf476524dda146ac2ec5472140477514e, plus the supplied LORD v1.8.1 source. All eight apps use release label 0.9; npm uses 0.9.0. No live deployment, school data mutation, timetable publication or staff message was performed.

## Fresh release checks

* GSiS: 636 current programs passed in one complete fresh run using scripts/verify-release.py --skip-package, four workers and the supplied Chromium executable. The separate package gate is also required, making 637 root gates.
* LORD: all 23 programs passed from the imported clean lord-suite tree using tests/run_all_checks.py. This includes real Chromium, 22 bridge cases, 8 signed cross-app contracts and 12 independent identity/history checks.
* Build: 134 Apps Script sources parse as ES2020. Generated notification Worker text/module parity passes.
* Package: 23 declared installation/document members: 8 frontend ZIPs, 5 complete backends, 1 scheduled Worker and 9 documents. Exact membership, every runtime byte, SHA256 hashes, bundled assets, offline guides, all release labels and clean LORD placeholders pass verification.
* Documentation:desktop/mobile manual and desktop architecture checks passed in Chromium; new LORD sections, search, anchors and offline assets were inspected.
* Independent release audit checked inventory, version pinning, source ownership, secret placeholders and upgrade requirements. Venue storage and WhatsApp configuration received separate source-based reviews.

The initial preflight ran without the required Chromium path and before producing v0.9 backend artifacts: 550 programs passed and 86 failed on those prerequisites. No product fix was claimed from that run. Both prerequisites were corrected, then the complete fresh 636-program run passed. Earlier review evidence is retained separately and is not substituted for this final run.

The final full package is rebuilt after commit and checked again so its metadata names the committed source. The Git tag and source history bundle identify the commit; no live version is inferred from them.

## Included behaviour

The reviewed Roster/STAPLER improvements, human decision provenance, allocator lifecycle safeguards, trusted timetable window invalidation and LORD local reference integration are included. See CHANGELOG_v0.9.md and the detailed reviews under docs/reviews/optimization-20261024 and lord-suite/docs/gsis-integration.

LORD clean source replaces ten inherited private configuration values with placeholders, including historical test fixtures. Existing installation IDs, secrets, booking peppers and session settings must be carried forward before upload. Storage schemas and exact retry keys retain their independent compatibility identifiers.

## Limits

Production peak concurrency, Google quotas, live provider delivery and installed trigger timing remain unverified. Roster retains its authoritative locked operations-document commit. LORD's Contacts and Deploy observations are independently versioned, not one upstream transaction. Failed or older-than-five-minute Contacts checks defer new LORD provider sends. Existing snapshot files are retained.

No extra venue sheet is needed for this release: the dedicated registry and separate Layout venue table already exist. venues.gsps.edu.sg is a logged future pipeline, not a delivered booking app. Automatic new-absence emergency notices after first publication and before 14:00, targeted publication follow-ups and expanded Calendar provider cooldown remain queued.
