# GSiS v0.8.5 changes

Implementation is complete. The final integrated verification record is VALIDATION.md. Baseline: v0.8.4a source commit `c98d377c9d032e19dcf9588a9f7faceeadb018ee`.

## Roster timetable preload and teacher views

The home screen renders before background timetable transfer starts. The first compressed batch supplies each baseline needed from Singapore today through 30 days ahead. The second supplies saved active suspended plans within that same window. The browser decompresses and validates a complete stage before installing it. Baselines can be used while the suspended stage is still pending.

Ordinary teachers receive only immutable confirmed snapshots. SMC/Admin can preload saved working drafts. Cached plans do not grant edit rights. Logout, role/date changes, access denial and writes invalidate the relevant cache; late obsolete responses cannot restore protected data. Unsupported compression uses an explicit plain read fallback.

Stapler gives teachers an immediate confirmed-date list while the complete authorised list refreshes. Timetable shows the latest current/future confirmation when it is newer than publication, labels it Confirmed and keeps the baseline below. An equal/newer publication retains its actual relief deltas. WhatsApp and private duty pages still use the published day.

## Absence reporting without a baseline

A teacher can record a full-day or start/end-time absence when no timetable applies, including dates or times outside the current baseline. The initial record has no lesson instructions; it keeps the relief requirement and the original absence interval. When a verified timetable later applies, reads and planning resolve the same record against its current periods. Manage my absences then allows instruction editing without creating a replacement absence.

Clock coverage follows actual positive time overlaps as timetable timings change; touching boundaries do not overlap. Existing text is preserved if a timetable temporarily disappears. Reason, date, role, overlap and same-record revision rules remain enforced, and uncertain saves keep their exact request. Mobile report/manage, domain and real-adapter recovery checks passed; integrated source results are recorded in VALIDATION.md.

## Deploy teaching-group recovery

IP Deploy rejects duplicate teaching-group names before queuing them, using trimmed, case-insensitive comparison against saved and pending groups. Backend errors name the conflicting group. Review opens immediately with checking feedback and a visible retry when current saved values cannot be read. A definitively rejected new group can be renamed in Review, applied back to the retained draft, and saved normally. Its temporary identity, linked teacher assignments and unrelated edits survive. An unconfirmed save stays immutable and uses Retry same save with its original receipt identity.

IP Deploy search now accepts the group subject and subject family. MTL finds the CL, ML and TL family, including HMTL/FMTL text. No automatic group merge or rename occurs.

The duplicate-group and silent Review defects were reproduced from source. Read-only school records showed accepted earlier assignments but no saved 3HCL1 in the inspected versions; Sim Lan's original browser payload and execution error were unavailable. The duplicate-group reproduction is a supported explanation, not proof of that exact failed request. See docs/GSiS-Sim-Lan-Investigation-v0.8.5.md.

## Read/write reliability and performance

Calendar writers now obtain fresh request-local metadata after acquiring the existing writer lock. A late reader can no longer refill the display cache with old lane/tag settings and cause a later write to accept a disabled value. Normal read caching remains.

Roster Inbox fetches remote Contacts before taking its writer lock, then reads current Inbox state and the current duty roster under that lock before validating and committing. Failed Contacts lookup makes no write; duplicate requests retain receipt protection. Signed delivery receipts avoid an unused Contacts lookup.

The suite audit maps storage, lock ownership, differential writes, receipts, caching and client work across all components. Roster still replaces its full operations document at final commit. Deploy publication still holds its lock through recoverable downstream handoffs. Further partitioning, parallel notification sending and broad new compression remain measured follow-up work. See docs/GSiS-Read-Write-Audit-v0.8.5.md. Integrated regression and package results are recorded in VALIDATION.md; fixture reductions do not establish production throughput.

## Included prior patch and installation

This full release includes v0.8.4a's relief-pool correction. Supplemental timetable staff such as SENOs retain their timetable rows but do not block R readiness or become automatic relief candidates solely because they appear in a suspended plan. Eligible baseline teachers with missing R still make capacity unverified.

Update the existing split projects using DEPLOYMENT.md. Preserve all original data and settings. Final test counts, artifact hashes and commit state belong in VALIDATION.md and RELEASE_SUMMARY.json once completed.
