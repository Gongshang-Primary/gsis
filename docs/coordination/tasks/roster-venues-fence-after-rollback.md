# roster-venues-fence-after-rollback: Roster saves blocked by a stuck Venues fence (incident 3 Nov 2026)

- Status: claimed by Codex, 3 November 2026; owner-authorised implementation due 17:00 SGT
- Owner/model: Codex
- Branch: codex/roster-venues-fence-after-rollback
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

## Bounded implementation claim

Model: Codex. Base main 1f6cc7cf90774390147aea8f96b23bd005122553. Owner's latest instruction limits this PR to safe cause codes and wording, a read-only Venues sync status in System Health, a five-minute warning using the existing SMC/Admin alert records, and an Admin recovery action that invokes the existing recovery functions in order. Work is restricted to Roster plus Venues read/recovery adapters, their generated copies, tests and documentation. Existing commit and save algorithms remain unchanged. No automatic transaction recovery, forced fence release, rollback/cutover redesign, Daily Notify wording change, deployment or live operation is included.

Acceptance: all three safe codes survive the backend/website diagnostic path; ready/pending/uncertain status reads both sources without changing their markers; a continuous outage over five minutes turns red and creates one existing SMC/Admin alert; ordinary users cannot inspect recovery details, SMCs can read but only current Admins can recover; the Venues step runs only for a verified COMMIT_UNCERTAIN token and records an evidence note; Roster recovery runs only after the Venues step succeeds or is unnecessary; either built-in refusal stops the chain; request/role/state races and malformed results remain explicit. Regenerate canonical copies with npm run build and run focused plus full Node/LORD checks before review. Claude reviews the exact head; owner merges.

## Implementation and local evidence

Model: Codex. Implemented the owner's three bounded requests. Roster's safe failure metadata and gateway preserve VENUES_FENCE_PENDING, VENUES_FENCE_UNCONFIRMED and COMMIT_UNCERTAIN and show the Admin recovery message. System Health reads the Roster marker and a signed Venues sourceStatus projection without clearing either marker. It shows ready/pending/uncertain, and turns red after more than five minutes. The existing five-minute maintenance lane records one SMC/Admin alert in the notification store, resolves it after readiness returns, and never queues a provider message. Existing pause/freeze and Google/D1 authority guards remain in force; the Google-marker monitor skips D1 authority.

The same-origin Admin action collects an evidence note and shows separate Venues and Roster outcomes. The backend rechecks current Admin authority, obtains the current Venues token itself, and only invokes venuesRecoverCommit for COMMIT_UNCERTAIN. It then calls recoverRosterVenuesSource. A refused, malformed or unconfirmed step stops the chain. The browser cannot supply a force flag or choose a recovery token. The signed recovery route trusts only the existing server bridge credential and the Admin identity established by Roster. Normal Venues sourceBegin/sourceComplete, save/commit algorithms, provider dispatch and school records are unchanged.

Local verification: npm run build regenerated all 18 components; Apps Script syntax gate passed. Eight focused programs pass: roster-venues-recovery.cjs, roster-venues-health-ui.cjs, roster-venues-gateway.mjs, venues093-roster-source.cjs, venues-sources.cjs, roster098b-health.mjs, roster098b-health-ui.cjs and roster-d1-health-authority.cjs. Tests cover the unchanged built-in recovery refusals and outcomes, read-only status, threshold/deduplication/resolution, safe codes, actual gateway role/origin checks, no supplied force/token, UI confirmation and each step result, plus existing source fingerprints and Google/D1 health authority. The new code-list and UI tests failed before implementation. The health fixture now permits exactly the additional scoped status read; all existing SELECT-only, role revocation and privacy assertions remain.

The workflow's documentation-only main claim was rejected by automatic approval review because the owner requested a draft PR. The task claim is retained on this PR branch; main was not changed. Full exact-head CI is required before handoff. No deployment, live recovery, configuration change or message send is claimed. Rollback reverts this PR's adapters, monitoring and UI; retained recovery evidence and existing markers are not deleted.

Additional local checks passed for the unchanged Venues transaction, domain, job and authority paths, Roster peer-mail health and the actual idle recovery cron. The cron retained its bounded reads and zero broad Roster loads. Current main advanced only in unrelated documentation while this task was open; those changes are preserved in the task branch merge.

The audit-health regression's old extraction ended at a named later export, so adding the independent Venues dispatch exposed a second export to its VM. It now extracts the next export boundary while retaining every audit/health assertion. The corrected audit-health program and UI program pass locally.

CI limitation: run 41578456742 at e8bf3e0ee3f3ffc20e078dc47bb142bd95747a83 failed every job before runner allocation. Each job has runner_id 0, no steps and no downloadable job log. No build or test command ran in that CI attempt, so it is not a code/test failure and not a pass. The connector could read check summaries but could not retrieve their annotations. Final handoff must retain this unresolved runner/startup limitation and must not claim a full-suite pass. Seventeen focused programs and the complete local 18-component build passed.

Final recovery verification also rejects a Venues result that omits the committed boolean; it never interprets an incomplete acknowledgement as a known non-commit. The UI explicitly distinguishes a recovered committed transaction from one that did not commit. Both tests failed first and pass after the correction. The existing recovery algorithms remain untouched. A second exact-head CI attempt, 41578619793, also ended before runner allocation. The draft PR is deliberately marked not ready to merge until the full suite can actually run.


## Owner-authorized v0.9.9j revision, 4 November 2026

Model: Codex. Reviewer: Claude at final head. Existing PR #67, branch `codex/roster-venues-fence-after-rollback`, rebased onto main `661e79004a274a33bdee6753507c9efa524cf007` with tree `054125ee825e7ccd1ae93f57933c4d5d51cdac36`. Owner orders this as item3 after scheduled cycle work; item2 is published for CI before these fixes start.

Fix the four regressions recorded in Claude comment6598192545: quiet mode issues no Venues backend call; preserve the single audit-lane contract and move Venues monitoring to its own job; place the second-lock check outside the shared Roster-source marker; show the recovery evidence form only for Admin with enabled, not-ready status. Do not raise lock-count expectations or weaken tests. Regenerate all matching outputs, require full GitHub Node/LORD suite, then immediately hand to Claude. No cutover/freeze/import authority code, live recovery, data repair or deployment changes. D1 source-marker health interpretation remains the recorded nonblocking follow-up.

## v0.9.9j regression fixes and local proof

All four original regressions reproduced before the revision. Quiet mode now blocks Venues dispatch, with a fresh quiet-mode read both after the minute jobs and immediately before the Google call. Venues monitoring runs as its own five-minute minute-lane job; the audit lane keeps its one-job and one-log contract. The second lock lives in `backend/RosterNotificationMaintenance.gs`, outside the complete `RosterVenues.gs` source marker, and uses the existing lock wrappers. Recovery controls are created only for a current Admin when Venues is enabled and not ready; refresh, revocation and ready state remove the form and any pending recovery confirmation.

Local verification: all 18 components rebuilt. The four unchanged regression programs pass: `paid097-jobs-idle.mjs`, `roster098i-audit-packaged.mjs`, `release505-timing.cjs` and `paid097-health-ui.cjs`. The actual Worker module plus SQLite test covers five-minute cadence, audit isolation, quiet mode and a pause renewed during earlier work. Recovery backend, gateway and browser programs pass, including current roles, unavailable/ready/unconfigured states and incomplete recovery acknowledgements. Full GitHub Node/LORD CI remains the handoff gate for the revised head. No live recovery, data repair or deployment ran.
