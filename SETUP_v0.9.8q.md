# Calendar 0.9.8q — two-file update

Install the matched Calendar backend and frontend. Q addresses a browser timeout during a long-running Calendar sync and adds recovery of the same run. The user-observed batch took about 49 seconds; the previous browser timeout was 45 seconds. This does not establish a performance guarantee for every event batch.

Other products stay at P. Calendar continues to use Google Sheets and Google Calendar through the existing Cloudflare Pages Worker. The separate O timetable preparation Worker, its D1 database and R2 bucket stay as they are. This update needs no new infrastructure or migration.

## 1. Keep the current settings

Keep a copy of the deployed Calendar code and its existing settings. Keep the current Apps Script web-app URL, Google file/calendar IDs, Google sign-in settings, Cloudflare bindings and GSIS_SECRET. Do not run setup or recreate the workbook; the supplied diagnosis already confirmed its schema.

Before replacing code, check that no Apps Script sync batch is still executing. A browser timeout or closing the page does not cancel Apps Script work. Keep the saved run and its checkpoints; a paused saved run can be resumed after this update.

## 2. Update the Calendar Apps Script backend

1. Open the existing Calendar Apps Script project.
2. Open Code.gs. Replace its contents with Calendar_Backend_v0.9.8q.gs from this patch.
3. Click Save.
4. Click Deploy → Manage deployments.
5. Select the existing Calendar web-app deployment and click Edit (the pencil).
6. Under Version, choose New version, then click Deploy.
7. Keep the existing web-app URL. Leave the deployment's access and execution settings unchanged.

Do not create a second deployment URL or change the Cloudflare backend URL when updating the existing deployment this way.

## 3. Update the Calendar frontend

1. Open Cloudflare → Workers & Pages → the existing Calendar Pages project.
2. Open Deployments and choose Create deployment or Upload assets, as available for the existing direct-upload project.
3. Upload Calendar_Frontend_v0.9.8q.zip. If the uploader needs a folder, extract this ZIP and select the folder containing index.html and _worker.js.
4. Choose Production and deploy.
5. Open Calendar and hard refresh. The visible version should read v0.9.8q.

Upload the Calendar frontend ZIP, not the outer patch ZIP or the review-source ZIP. Do not replace the separate Calendar jobs Worker for this patch.

## 4. Resume the current saved run

Sign in with your existing Calendar administrator account. Resume the existing run. The supplied diagnosis showed 31 remaining items: 30 actionable items and one blocked source save. Let the current run process its 30 actionable items. Keep the blocked item's receipt until its source-save outcome has been checked; do not delete it to make the count reach zero.

Sync requests now wait up to 90 seconds. If a batch response is uncertain, the page checks the saved status for the same run instead of treating the timeout as a confirmed failure or creating a new run automatically. Keep the page open while it checks progress. Stop waiting stops the local wait; the server may still finish. It is not a server-side cancellation or a rollback of events already written. Do not repeatedly press Sync while an earlier request may still be running.

Inspect the saved completion outcome before requesting another run. The current run retains 30 older schema-error entries and excludes those failed IDs from its current work. Fresh workbook checks already confirmed the required schema; running setup or the schema upgrade again will not clear those error entries or retry the failed IDs.

After the current run has settled, use an explicit Sync to retry those 30 older failures. Q does not automatically create that new run. Existing provider identities remain in use. Separately resolve the one blocked source-save outcome through the existing review path. A completed run with failed or blocked items still needs attention.

Check the corresponding Google Calendar events after synchronization. Local tests cannot confirm live provider outcomes or the school's actual sync speed.

## 5. If the outcome is still uncertain

Record the run ID, visible status and any error reference. Check the Apps Script execution for that time before starting another run. Do not clear sync properties or change event IDs to force progress. The update preserves the existing checkpoint format and Google production authority.

For rollback, first ensure no run remains in progress, then restore the matched P Calendar backend and frontend. Preserve the workbook, secrets, URLs and existing bindings.

## Package contents

Only Calendar_Backend_v0.9.8q.gs and Calendar_Frontend_v0.9.8q.zip are deployment files. PATCH.json identifies the source revision and component versions. Docs contains current setup, changelog and validation notes. The separate Calendar_Review_Source ZIP contains current source, the P-to-Q diff, tests and selected evidence for a second opinion. Known historical live-observation JSONs and private configuration files are excluded. The LORD catalogue contract test now uses synthetic input; older test fixtures may still contain historical names.

## Official deployment references

[Cloudflare Pages direct upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) and [Apps Script deployment versions](https://developers.google.com/apps-script/concepts/deployments) describe the existing-project deployment steps above.
