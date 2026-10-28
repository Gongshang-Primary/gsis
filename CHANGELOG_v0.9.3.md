# GSiS Suite v0.9.3 release notes

25 October 2026. All nine frontends, six Apps Script backends and the scheduled Roster Worker use 0.9.3. This release completes the accepted changelog scope. There is no separate active product backlog.

## Changes

- Assign Relief restores a profile-scoped server-confirmed grid from IndexedDB without a blocking blur. Filters and local drafting work during the current-state check; outgoing actions require successful verification. Local edits survive refresh and conflicts retain human attribution. Foreground loading time excludes background timetable preloads.
- Calendar data is reused through actor/configuration-bound signed 62-day windows. Source age is bounded to five minutes across cache layers. A changed revision replaces the window; writes still fetch fresh Calendar context.
- Allocation reads reuse immutable baseline references while refreshing current absences, assignments, suspended plans, quota balances, permissions and allocator state. The browser compares global revision, dated token, reference key and clock before reusing an allocation projection.
- STAPLER draft saves reuse unchanged confirmed packages and trusted source digests. Exact request recovery, revisions, readback receipts, validation and Venues source fences remain enforced. In the fixed 104-teacher/eight-history fixture, decompressions fall from nine to one, compressions from three to two, and hashed characters from 18.24M to 7.79M. These deterministic work reductions do not prove a production timeout has disappeared.
- New absences after first publication and before 14:00 Singapore time alert all verified duty SMC. Targeted publication previews and sends cover teachers whose present-period relief changes, including removals, with a publication revision fence and durable notification identity. Returning teachers receive new relief, pending removal corrections survive unrelated attendance changes, and previously sent corrections remain suppressed. Proven emergency notices can pass ordinary quiet hours; 14:00 limits their creation, not later delivery.
- Calendar sync and wipe share provider pacing and durable cooldowns. The screen shows progress and retry time. Background continuation respects the same deadline; uncertain event identities are reconciled before retries. Permission, rate and daily quota failures are distinguished.
- Venues reads immutable published Deploy versions by booking date, including current/future years, room names and period grids. Missing or ambiguous Calendar/Roster/publication coverage stays unavailable. Unchanged annual pieces are reused; current bookings and unaffected transfers survive future publications.
- The Venues Cloudflare signing-key redirect compatibility fix is included. Existing LORD photo reliability, custom fields, remarks spacing, property pruning, return controls and background diagnostics remain included.

## Deployment

Follow README.md as the single setup authority. Install matching backends before frontends; preserve endpoint URLs, secrets, peppers, workbook/folder IDs and existing scheduled owners. No new required secret, binding or manually created property is introduced. `VENUES_SCHOOL_YEAR` is ignored and may remain in place. Calendar manages its revision/pacing state automatically.

Venues can retain only proven current publications and later publications. This upgrade cannot reconstruct discarded historical publication pointers from editable drafts. Verify the current and upcoming booking dates after source sync.

No live deployment, production setting change, timetable publication or provider send was performed during implementation. The deployment smoke checks in README remain necessary for real sign-in, message delivery and morning latency. See VALIDATION_v0.9.3.md in the source archive for executed local checks and review findings.
