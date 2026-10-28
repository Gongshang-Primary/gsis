# GSiS v0.9.6: smaller cron ticks and R2 cache cleanup

This is a cumulative component update for v0.9.5 or v0.9.5a. It includes the v0.9.5a STAPLER Add teacher fix and partial text search. No live deployment was performed.

## Repacked on 26 October 2026

The first component archive copied the source `_worker.js` with sibling imports. This revision applies the same self-contained Worker bundling step as the full release builder to Roster and Deploy. Their version remains v0.9.6. The standalone Workers in the actual ZIPs now pass loading, configuration, asset-serving and authentication checks. Cloudflare's screenshots showed failure status without an error log, so the exact remote rejection has not been confirmed.

To retry a failed Roster upload, upload the corrected `Roster_Frontend_v0.9.6.zip` to the existing `gsps-roster` Pages project. The separately supplied `Roster_Frontend_v0.9.6_repacked.zip` contains the same bytes. Use the corrected Deploy frontend from this archive for Deploy as well. A component archive contains nested ZIPs; upload the relevant frontend ZIP, not this outer archive. Backend and notification Worker files are unchanged by the repack and need no second update if already installed.

Keep the daily R2 cleanup trigger disabled until both Roster Pages and the notification Worker have successfully updated to v0.9.6. The minute trigger remains in place.

## Install

1. Save open plans. Keep a copy of the currently deployed component files and settings.
2. Update the existing Roster Apps Script with `Roster_Backend_v0.9.6.gs`. Keep the existing deployment URL, Script Properties and permissions. This includes the STAPLER server validation required when upgrading directly from v0.9.5.
3. Upload `Roster_Frontend_v0.9.6.zip` to the existing Roster Pages project. Keep its D1, private R2, Access, secrets and environment bindings.
4. Upload `Deploy_Frontend_v0.9.6.zip` to the existing Deploy Pages project. This adds the shared handoff idle check; Deploy authority and saved data are unchanged.
5. Replace the existing notification Worker code with `Roster_Notification_Worker_v0.9.6.txt`. Keep all live bindings, secrets and feature flags. Do not replace them with disabled example values from the source configuration.
6. Keep the Cron Trigger `* * * * *`. Add `15 18 * * *` for the separate daily cache cleanup at 02:15 Singapore time. Cron expressions use UTC. Do not replace the minute trigger.
7. Reload Roster and Deploy and confirm v0.9.6 in the header and `/api/config`. Check Worker logs after a normal tick and after the daily cleanup.

Deploy the Roster Pages Worker before enabling the daily cleanup trigger. Both the Pages Worker and notification Worker must use v0.9.6 because they share the cache promotion safeguards.

## What changes

Empty scheduled allocation, notification, inbox, peer proposal, instruction, mail and Deploy handoff jobs check small primary D1 results before loading operational state. Existing time rules, durable claims, retries, manual decisions and authority checks remain active.

Timetable preparation skips empty unchanged work, repairs missed enqueueing from source versions, and prepares at most two stage jobs per invocation. It no longer downloads the stored package just to discard the response. Reused plan parts do not hydrate their saved models again.

Audit exports process only changed dates, at most one date per normal cron call. Unchanged primary Roster heads skip audit history scans entirely. Additive D1 indexes keep completed message history out of the live-work probes. D1 creates new tables and indexes automatically; the first schema update can take longer while indexes are built.

## R2 cleanup policy

Cleanup applies only to generated objects under `roster/timetables/v2/parts/`. The object must be at least 30 days old and absent from every current package manifest. It then spends at least 24 hours in quarantine before deletion. Each daily invocation lists at most 50 objects and deletes at most 10. A saved cursor continues the scan on later days. The first sweep of a large bucket therefore takes multiple days.

Permanent D1 retirement markers prevent a concurrent cache build from publishing a reference to a part being deleted. Writers use a new object key if they need the same content again. Current manifests, raw source timetables, STAPLER models and archives, uploaded workbooks, recovery receipts, WhatsApp media and audit exports are protected from this cleanup.

The daily log event is `roster-r2-cleanup`. It contains counts, not staff data or object keys. Failures emit `roster-r2-cleanup-failed`; failed deletions remain retryable. Diagnostics-only mode continues to suppress operational jobs, including cleanup.

## Verify in production

Check that idle minute ticks no longer rewrite timetable or audit objects. Confirm a newly reported absence reaches the normal flow, SMC decisions remain intact, and scheduled notices still use the existing times. Compare Cloudflare CPU measurements for idle and busy invocations separately.

Local tests verify the removed work, not Cloudflare CPU consumption. Active allocation, reference refresh, cache builds and cleanup can still exceed the free plan's 10 ms CPU allowance. This update does not guarantee every busy invocation fits that allowance.

## Rollback

Remove the new daily cleanup trigger before rolling back either Worker. Restore compatible Roster and notification Worker components together. Keep the additional D1 tables and indexes; they do not change business records.

If v0.9.6 created replacement cache keys with a UUID suffix, v0.9.5a cannot read those derived manifests. Before returning to v0.9.5a, clear only the derived package manifests in the shared D1 database:

```sql
DELETE FROM gsis_timetable_packages WHERE scope = 'roster';
```

The older version rebuilds these packages on demand. Do not delete source records, source R2 objects, receipt tables or the bucket. STAPLER plans saved with newly allowed staff still require the v0.9.5a or later server validator.
