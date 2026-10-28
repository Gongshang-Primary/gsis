# GSiS 0.9.8k urgent Roster patch

Baseline: revision J, commit `a2b436296ceb81ae3463b26b7dd8abd182939c99`. This patch changes Roster only. Other products retain J. Google stays authoritative. No new database, bucket, Worker, Queue, secret, trigger or authority migration is required.

## 1. Update the existing Roster backend

Keep a copy of the current Roster Apps Script code and its deployed version number. Preserve all Script Properties, existing shared `GSIS_SECRET` (including a working 33-character value), Google IDs and the existing web-app URL.

Open the existing Roster Apps Script project. Replace its combined backend code with `Roster_Backend_v0.9.8k.gs`, then save. Select **Deploy → Manage deployments → pencil → New version → Deploy**. Keep the existing `/exec` URL. Saving code in the editor alone does not update the deployed web app.

## 2. Update the existing Roster Pages frontend

Open Cloudflare **Workers & Pages → your existing Roster Pages project → Create deployment**. Upload `Roster_Frontend_v0.9.8k.zip` using the same production upload process as J. Keep all environment variables, secrets, domains and bindings. Refresh the Roster browser after deployment. The matched frontend and backend must both be installed.

## Optional: update an existing Worker copy

The package includes `Roster_Notification_Worker_v0.9.8k.txt` and `GSiS_Operations_Worker_v0.9.8k.txt` because both bundle the same Roster rule helpers. These are parity updates for existing installations only. If an included Worker already serves your deployment, replace its code in **Edit code → Deploy**, preserving its existing settings, bindings and schedules. Do not create or activate a private Operations Worker, change authority flags, or add storage for this patch. Do not deploy these files to Pages.

Keep existing critical `* * * * *`, audit `2-57/5 * * * *` and cleanup `15 18 * * *` schedules. This patch changes no cron expression.

## What the fix changes

Confirmed suspended timetables no longer disable business rules. Automatic allocation respects the configured daily and consecutive limits, verified weekly R, employment caps, annual R utilisation and every other enabled preference in its saved order. It still uses the actual dated Stapler timetable for clashes and occupied periods. Ordinary Deploy workload formulas are not recalculated from that suspended timetable; existing verified published inputs remain the source. Cumulative R continues to count actual relief under the existing counting rules.

Existing disabled settings remain disabled. The latest supplied log showed eight daily periods and six consecutive periods; this patch does not reset those values. Missing required history or quota inputs must be reported rather than treated as unlimited capacity. Logs distinguish recorded configured/effective policy from historical evidence.

## Check the current day safely

Open **Assign Relief**, select the date and refresh records. Inspect the affected teacher's actual timetable, relief assignments and saved business settings.

The patch prevents further automatic rule bypass. It does not erase or redistribute already published, manual or peer arrangements. **Auto-allocate** fills gaps and preserves existing choices. The existing optimisation window still ends at **06:29 Singapore time**; installing this patch after that cutoff does not force a new whole-day optimisation. SMC should review and change affected covers individually where needed. Do not clear all assignments or delete history to force a rerun. Protection does not certify an over-cap record as valid. Non-UT contractual employment caps remain non-overridable. Existing permitted UT manual overrides retain their warnings and audit evidence. Review an old flagged record explicitly; do not silently delete or redistribute it.

Publishing and WhatsApp remain separate actions. Updating code does not itself publish work or send a message. Normal already-enabled scheduled work keeps its existing schedule and behaviour.

## Verify and retain recovery material

Check `PATCH.json`: version `0.9.8k`, baseline `0.9.8j`, four components, committed source. The two Worker components are optional existing-installation parity updates. Read `VALIDATION.md` and verify `SHA256SUMS.txt`. Source patches and history are maintenance files, not Pages uploads. The unchanged separate `GSiS_v0.9.8i_Rehearsal.zip` is not part of this production installation.

## Rollback

Retain receipts and school records. Restore saved J Roster backend and frontend deployments as a matched pair, plus an included Worker only if it was updated. Preserve current settings and data. Rollback restores J behaviour, including its broad suspended-day rule bypass; it does not undo saved school choices or recall submitted messages.
