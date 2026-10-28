# GSiS 0.9.8m Roster patch

Baseline: revision L, commit `b029e0972ec1b88fad17d30829861b1e7a3b36ec`. Install the two matched Roster files below. Google stays authoritative. No new database, bucket, Worker, Queue, key, trigger or authority migration is required.

## 1. Update the existing Roster backend

Back up the current code and deployed version. Preserve all Script Properties, existing shared `GSIS_SECRET` including a working 33-character value, Google IDs and the existing web-app URL.

Open the existing Roster Apps Script project. Replace its combined code with `Roster_Backend_v0.9.8m.gs`, then save. Select **Deploy → Manage deployments → pencil → New version → Deploy**. Keep the existing `/exec` URL. Saving editor code alone does not update the deployed web app.

## 2. Update the existing Roster Pages frontend

Open Cloudflare **Workers & Pages → your existing Roster Pages project → Create deployment**. Upload the inner `Roster_Frontend_v0.9.8m.zip`, preserving all environment variables, secrets, bindings and domains. Keep any unsaved planning work recorded before refreshing the existing tab. Refresh Roster after deployment.

Both **Auto-allocate** and **Auto-fill blanks** are available at any time on eligible current/future dates. Auto-allocate considers blank unstarted periods and existing unstarted unpublished automatic assignments together. Auto-fill blanks fills only eligible unstarted blanks and keeps every existing assignment.

Both controls keep already-started and completed duties fixed. They preserve published, manual SMC, approved peer, explicitly protected and manual no-relief/clear decisions. Pending peer proposals reserve their lessons. They do not fill elapsed blanks. Past dates remain view only. The actual server clock and commit checks protect periods that start while a run is being calculated.

All enabled K business rules remain active on ordinary and suspended dates. The existing verified school-day, timetable, identity, availability, annual history, R and employment-cap checks remain. Missing required inputs can still pause allocation. Legacy clients and retained requests without an explicit mode remain fill-only. Installing code does not run allocation, publish or send WhatsApp.

## Existing scheduled work stays unchanged

This patch removes the time-of-day limit from the two manual controls. It does not add scheduled runs or extend the scheduled optimiser past its existing **06:29 Singapore time** cutoff. Keep current allocation and notification settings. A manual click can allocate when the scheduled allocator is disabled, subject to the existing permissions and business rules.

## Optional: update an existing Worker copy

The package includes `Roster_Notification_Worker_v0.9.8m.txt` and `GSiS_Operations_Worker_v0.9.8m.txt` for bundled helper parity. If that Worker already serves production, use **Edit code → Deploy** with the corresponding file and preserve all bindings, settings and schedules. Do not create or activate a private Operations Worker, D1, R2 or Queue for this patch. Worker files are not Pages uploads.

Keep existing critical `* * * * *`, audit `2-57/5 * * * *` and cleanup `15 18 * * *` schedules. No cron expression changes.

## Verify and retain recovery material

Check `PATCH.json` for version `0.9.8m`, baseline `0.9.8l`, four components and committed source. Only the Roster frontend/backend pair is mandatory. The two Worker files are optional updates for existing installations. Read `VALIDATION.md` and verify `SHA256SUMS.txt`. Source patches and Git history are maintenance material, not Pages uploads. The unchanged separate `GSiS_v0.9.8i_Rehearsal.zip` is not part of this production installation.

Calendar and Deploy retain their L versions, including L's native Calendar storage and atomic class rename handling. M does not deploy those products again. If the school still needs their L updates, use the separate matching L component files and L setup guide. Other products retain J.

## Rollback

Restore the actual backed-up Roster frontend/backend pair, and an optional Worker only if updated. Preserve school records, journals, receipts and settings. Restoring L returns the manual Auto-allocate overnight restriction; Auto-fill blanks remains available at any time. Rollback does not undo saved assignments or recall submitted messages. Do not clear assignments or history to force a rerun.
