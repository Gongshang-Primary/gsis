# GSiS 0.9.8l Roster, Calendar and Deploy patch

Baseline: revision K, commit `00c118c442504330b58990924b5414cb8c7de7b5`. Install the six matched backend/frontend files below. Other products retain J. Google stays authoritative. No new database, bucket, Worker, Queue, key, trigger or authority migration is required.

## 1. Update the existing Roster backend

Keep a copy of the current code and deployed version. Preserve all Script Properties, existing shared `GSIS_SECRET` including a working 33-character value, Google IDs and the existing web-app URL.

Open the existing Roster Apps Script project. Replace its combined code with `Roster_Backend_v0.9.8l.gs`, then save. Select **Deploy → Manage deployments → pencil → New version → Deploy**. Keep the existing `/exec` URL. Saving editor code alone does not update the deployed web app.

## 2. Update the existing Roster Pages frontend

Open Cloudflare **Workers & Pages → your existing Roster Pages project → Create deployment**. Upload the inner `Roster_Frontend_v0.9.8l.zip`, preserving all environment variables, secrets, bindings and domains. Refresh Roster after deployment.

**Auto-allocate** considers blanks and existing unpublished automatic assignments together, within the existing window from 4 pm the previous day through **06:29 Singapore time**. **Auto-fill blanks** works at any time on eligible current/future dates, fills only unstarted blank demands and keeps existing assignments. The buttons retain published, manual, peer and explicitly protected choices. Scheduled optimisation keeps its existing window. Legacy clients and retained requests without an explicit mode remain fill-only. The backend and frontend must match.

All enabled K business rules remain active on suspended days. Ordinary Deploy workload formulas are not recalculated from the suspended plan; actual dated occupancy and cumulative relief still count. Existing protected over-limit work requires SMC review. Installing code does not run allocation, publish or send WhatsApp.

## 3. Update the existing Calendar backend

Back up the current Calendar backend and deployed version. Replace its combined code with `Calendar_Backend_v0.9.8l.gs`, save, then select **Deploy → Manage deployments → pencil → New version → Deploy** on the existing web app. Preserve its `/exec` URL, Script Properties, spreadsheet and calendar IDs, secrets and existing triggers.

Calendar uses native `SpreadsheetApp` for spreadsheet data IO. The rollback concerns Sheets access only. Keep existing Google Calendar integration and permissions. Do not remove an Advanced service used by another product or change shared project settings during this patch. Existing mutation journals, conflict handling and interrupted-sync recovery remain. Normal direct Calendar mode still works without a Calendar job Worker or new D1.

## 4. Update the existing Calendar Pages frontend

Open the existing Calendar Pages project and create a deployment with the inner `Calendar_Frontend_v0.9.8l.zip`. Preserve all settings, bindings and domains. Refresh Calendar. If an optional Calendar job Worker is already used, retain that existing setup; its code remains J and this patch does not create or activate another Worker.

Start with a small deliberate event edit, confirm it is saved, then use the existing sync action and check its status. Local checks cannot establish live Google quota or permission state. The setup process itself does not create or publish a test event.

## 5. Update the existing Deploy backend

Back up the current Deploy code and deployed version. Replace its combined code with `Deploy_Backend_v0.9.8l.gs`, save, then select **Deploy → Manage deployments → pencil → New version → Deploy** on its existing web app. Preserve all Script Properties, IDs, shared keys and its `/exec` URL.

## 6. Update the existing Deploy Pages frontend

Before refreshing an old Deploy tab, open **Review** and record every pending change. Keep that tab open until the changes are captured. Do not rely on an upgrade recovering unsaved legacy work, and do not select Discard before recording it. Save valid unrelated edits first if possible.

Open the existing Deploy Pages project and create a deployment with the inner `Deploy_Frontend_v0.9.8l.zip`. Preserve all settings, bindings and domains. After capturing old unsaved work, refresh Deploy and redo any unsaved rename using the current controls.

The supplied screenshot shows v0.9.7. L includes the class rename handling introduced in G; install both matched files rather than mixing an old frontend or backend. A class rename keeps assignments and venue links attached to the stable class row. An occupied destination can create a temporary undefined row in the local planning session. Resolve every undefined row before saving. Several local undefined rows and any primary level are supported. The completed batch must have unique nonblank class names and short names. Final uniqueness and stale-data checks remain; the patch must not silently discard conflicting work.

## Optional: update an existing Worker copy

The package includes `Roster_Notification_Worker_v0.9.8l.txt` and `GSiS_Operations_Worker_v0.9.8l.txt` for bundled helper parity. If that Worker already serves production, use **Edit code → Deploy** with the corresponding file and preserve all bindings, settings and schedules. Do not create or activate a private Operations Worker, D1, R2 or Queue for this patch. Worker files are not Pages uploads.

Keep existing critical `* * * * *`, audit `2-57/5 * * * *` and cleanup `15 18 * * *` schedules. This patch changes no cron expression.

## Verify and retain recovery material

Check `PATCH.json` for version `0.9.8l`, baseline `0.9.8k`, eight components and committed source. Six backend/frontend components are mandatory matched updates. The two Worker files are optional updates for existing installations. Read `VALIDATION.md` and verify `SHA256SUMS.txt`. Source patches and Git history are maintenance material, not Pages uploads. The unchanged separate `GSiS_v0.9.8i_Rehearsal.zip` is not part of this production installation.

## Rollback

Restore each affected product's actual backed-up backend/frontend deployments as a matched pair, and an optional Worker only if updated. Do not assume the currently deployed school copies already match K or J; the supplied Deploy screenshot reports v0.9.7. The source baseline is K, whose Calendar and Deploy components remain J. Preserve current school records, journals, receipts and settings. Rollback does not undo saved edits or recall submitted messages. K's Auto-allocate is fill-only. Restoring an older Calendar copy also restores that copy's previous sheet IO behaviour. Do not clear assignments or history to force a rerun.
