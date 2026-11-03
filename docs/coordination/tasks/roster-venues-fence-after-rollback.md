# roster-venues-fence-after-rollback: Roster saves blocked by a stuck Venues fence (incident 3 Nov 2026)

- Status: incident resolved live 12:05; code follow-up proposed (Codex, lane R + Venues), not yet assigned
- Reviewer/model: Claude

## Incident (3 Nov 2026, Google is the record)
- From 06:16 every Roster save that changes timetable/occupancy failed with "The Roster save could not be confirmed" (BACKEND_ERROR, failureStage `save`, no backendCode): Let teachers see, Stapler confirm (Hazmi 6 Nov, owner), scheduled allocation; background jobs failed intermittently. WhatsApp sends still worked, so teachers were notified at 07:12 while the day stayed unpublished (Daily Notify showed "No timetable has been published" and 0 acknowledgements beside per-teacher "Acknowledged").
- Cause chain: Roster commit calls `rosterVenuesBegin_` (`backend/RosterVenues.gs`); Google marker `ROSTER_VENUES_SOURCE` was `pending` (token f77ac450…, previous abcad51e…); `recoverRosterVenuesSource` failed because the **Venues backend** refused every operation with `COMMIT_UNCERTAIN` ("A prior save has an unknown outcome… transaction 2c044c49-dd4c-4bf9-9463-373d8529a4a5", `venues-backend/Code.gs` `venuesCheckCommit_`).
- Resolution: owner ran `venuesRecoverCommit('2c044c49-…', evidence)` in the Venues project → `{"recovered":true,"committed":false}`; then `recoverRosterVenuesSource` in Roster (no error); Let teachers see published 53 assignments, 0 unassigned.

## Follow-ups (Codex)
1. **Surface the cause:** add `VENUES_FENCE_PENDING`, `VENUES_FENCE_UNCONFIRMED` and Venues `COMMIT_UNCERTAIN` to the safe code list (`backend/Roster.gs` `rosterFailureDetail_` codes) and show "Venues sync needs Admin recovery (run recoverRosterVenuesSource / venuesRecoverCommit)" instead of a generic save failure; System Health shows the stuck state.
2. **Find the uncertain Venues save:** what left transaction 2c044c49 uncertain (Monday 2 Nov D1 window 04:41-05:19, the emergency rollback, or Tuesday 06:16 load). Make the Venues commit path recover its own marker when the stored state proves the outcome, without an admin step.
3. **Cutover safety:** D1 Roster also writes the Venues source fence as `roster`. `Reset D1 after manual rollback` (#51) and Switch back must release or reconcile that fence, and the cutover runbook must check `venuesFenceDiagnose` (both sides ready) before activation and after any rollback.
4. **Daily Notify wording:** when WhatsApp was sent but publish failed, say so ("WhatsApp sent 07:12 · not yet published"), and count WhatsApp-link acknowledgements or label the panel "published-day acknowledgements".

## Admin tools used (kept in owner's Apps Script files)
- Roster GSiS `EdgeAuthorityTools`: `venuesFenceDiagnose` (read-only), `edgeAuthorityStatus`, `edgeAuthorityRollbackToLegacy`.
- Venues `VenuesAdminTools`: `recoverVenuesTx_3Nov` (one-off).
