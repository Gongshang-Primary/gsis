# GSiS v0.9.8: restore critical Roster operations

This recovery package updates three existing components. It uses the Google Roster records through the Roster Worker gateway and the existing notification Worker. It requires no new database, Queue, secret or migration.

Use this package for the current installation where Roster D1 migration remains in legacy mode. If Roster was subsequently activated in D1, stop and check its ownership first. Do not remove the managed Apps Script migration fence or copy an old database over current records.

## 1. Update the existing Roster Apps Script

Open the Roster Apps Script project. In Editor, replace the contents of its existing Code.gs with Roster_Backend_v0.9.8.gs. Save. Select Deploy, then Manage deployments. Edit the existing web app deployment, select New version and Deploy.

Keep its deployment URL, project ownership, Script Properties and execution permissions. This is the Roster project, not the Deploy project. The temporary AbsenceCheck diagnostic file may remain; it does not run automatically.

## 2. Update Roster Pages

In Cloudflare, open Workers & Pages, then the existing gsps-roster Pages project. Create a new production upload using the enclosed Roster_Frontend_v0.9.8.zip. Upload that inner ZIP, not the outer Updated Deployments package.

Keep the existing GSIS_JOBS D1 binding and notification Queue connection. Existing captured reports live there. Keep authentication, Calendar/Contacts connection settings, public origins and secrets. The v0.9.8 request entry ignores the unfinished private backend and D1 operational routing configuration; it does not reset or migrate their data.

## 3. Update the notification Worker

Open Workers & Pages, then gsis-roster-notifications. Select Edit code. Replace its code with the complete contents of Roster_Notification_Worker_v0.9.8.txt and deploy.

Keep the existing GSIS_JOBS database, NOTIFICATION_QUEUE binding, media bucket and WhatsApp credentials. Keep the minute Cron Trigger `* * * * *` once.

Verify these existing switches under Settings, Variables and Secrets:

| Variable | Required value for normal operation |
| --- | --- |
| ROSTER_AUTOMATION_ENABLED | true |
| WHATSAPP_ENABLED | true |
| WHATSAPP_DIAGNOSTICS_ENABLED | false |
| GSIS_RECOVERY_MODE | false |

The recovery build respects deliberate pause switches. It does not turn them on or off silently. The private GSIS_BACKEND and paid GSIS_BACKGROUND_QUEUE paths are not required by this build. Do not delete either Queue, database, bucket or journal to perform this update.

## 4. Resolve the known captured reports

In Assign Relief, select 27 October 2026. Open Review report for each retained Kavitha report. The current primary store contains five records on 26–30 October, but their coverage must still be checked. The report review shows saved coverage and dates without a saved record. A saved record on a date does not by itself prove the requested full day is covered.

Save the missing valid dates through Report Absence. For the observed incident, the unrecorded part of the requested range was 31 October to 2 December. Use the intended absence type and full-day coverage, with the live form's Calendar validation. The earlier diagnostic did not verify the school calendar; it does not establish that every calendar date needs an absence entry. Submit once, wait for Absence saved and verify the entries in Manage school-wide absences. If a new report still needs review, read its reason before making another submission.

After all intended dates and coverage are accounted for, explicitly withdraw the two superseded broad reports. Use a reason such as: Existing 26–30 October coverage verified; remaining dates saved separately. The withdrawal changes that received report's status and retains its audit record. It does not delete saved absences.

Do not withdraw the reports merely to make the error disappear. The scheduler remains blocked while a relevant received absence has not been resolved.

## 5. Verify production recovery

Reload Roster and confirm v0.9.8. Confirm the intended absent teachers and existing manual assignments for 27 October. Watch the next due allocation cycle in Assign Relief and in the notification Worker's logs. The cron fires every minute, while allocation and summary actions follow their existing configured schedule. A successful cron invocation alone is not evidence that an allocation was performed.

Check that the allocation event reports a completed cycle rather than a pending-absence block. Verify the intended WhatsApp notice actually arrives, and check its recorded delivery state. Quiet hours, approved templates, recipient checks and prior delivery claims still apply. Do not repeatedly press Send WhatsApp to test recovery.

## Paused background work

The recovery minute loop excludes the migration reference refresh, private paid background jobs, Deploy handoffs, timetable prewarming, Calendar continuation, allocation audit export, daily employment email and delivery review report. Existing Google services still supply the live reads needed by critical Roster operations. The saved records and queued auxiliary work are retained for a later controlled restart.

The separate daily R2 cleanup trigger may remain configured. Under this Google-authoritative recovery profile it skips deletion because it cannot verify an active D1 reference manifest. No cache bucket is emptied during recovery.

The private-service System Health panel is also paused. Use the notification Worker's Observability logs to check allocation and delivery during this recovery release.

Roster's timetable occupancy export to Venues is paused in this release. It cannot read a migrated D1 snapshot while Google is the active Roster record source. The existing Venues installation is unchanged, but its Roster feed is unavailable until separately restored.

If the newer gsis-background-jobs Queue still has this Worker as its consumer, pause that consumer after the critical Worker is installed. Keep the older gsis-roster-notifications Queue consumer enabled. Unsupported paid-job wakes must not be treated as successfully completed.

## Recovery boundary

These components have been built and checked locally. No production deployment or message send is performed by preparing this package. A code rollback alone does not clear the two persisted reports. Keep Google authoritative until critical operations are verified; resume migration separately.
