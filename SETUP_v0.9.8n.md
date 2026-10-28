# GSiS 0.9.8n Roster intake patch

Baseline: revision M, commit `c4978418fec42eb5563893e767cc9ed6ecd50688`. Install the two matched Roster files below. Google stays authoritative. No new database, bucket, Worker, Queue, secret, trigger or authority migration is required.

## 1. Update the existing Roster backend

Back up the current code and deployed version. Preserve every Script Property, existing shared `GSIS_SECRET` including a working 33-character value, Google ID and existing web-app URL.

Open the existing Roster Apps Script project. Replace its combined code with `Roster_Backend_v0.9.8n.gs`, then save. Select **Deploy → Manage deployments → pencil → New version → Deploy**. Keep the existing `/exec` URL. Saving editor code alone does not update the web app. Leave the read-only IntakeCheck helper in its separate file or remove that helper after diagnosis; do not duplicate the combined backend.

## 2. Update the existing Roster Pages frontend

Open Cloudflare **Workers & Pages → your existing Roster Pages project → Create deployment**. Upload the inner `Roster_Frontend_v0.9.8n.zip`. Preserve all environment variables, secrets, bindings and domains. Record any unsaved planning work before refreshing the tab. Refresh Roster after deployment.

## 3. Check the retained reports

Open **Assign Relief → Received reports**, select the affected date and refresh the saved status. Existing pending reports retain their request identities and can retry through the current processor; do not submit replacement reports merely to clear the notice. If a retained report shows a **Retry** control, use that existing control once and refresh its receipt status.

For a later report from the same reporter who also made the latest saved edit, a future shorter absence becomes the default accepted coverage. Exact repeats reuse the saved absence; wider reports add uncovered coverage. An explicit saved coverage choice takes precedence. A report from a different actor still needs a choice. A reduction affecting started periods or protected SMC, peer or shared cover still requires the existing review, rather than silently cancelling those decisions.

The 29 October diagnosis passed clash rules but its proposed save was 412 characters above the old ceiling. N raises the existing document guard from **12,000,000** to **16,000,000 characters**, measured as JavaScript UTF-16 code units. This is bounded headroom in the same Google JSON document, not a new Google or Cloudflare service limit. It changes no storage format and removes no records. If the new ceiling is reached, the retained report must show an actionable storage issue instead of endlessly claiming an automatic retry will resolve it.

The existing 30 October shorter-review receipt is eligible for one recovery attempt under the corrected rule. This is not a promise of automatic completion: current authority, newer edits, started periods and protected-cover checks still apply. A receipt marked saved or applied confirms absence intake; it does not confirm WhatsApp delivery. Installing the patch does not itself run allocation, publish or send messages. Existing scheduled processors may continue their normal work after deployment.

## Optional: update an existing Worker copy

The package includes `Roster_Notification_Worker_v0.9.8n.txt` and `GSiS_Operations_Worker_v0.9.8n.txt` for shared-helper parity. If that Worker already serves production, use **Edit code → Deploy** with the corresponding file. Preserve all bindings, settings and schedules. Do not create or activate a private Operations Worker, D1, R2 or Queue for N. Worker text files are not Pages uploads.

Keep existing critical `* * * * *`, audit `2-57/5 * * * *` and cleanup `15 18 * * *` schedules. Both manual **Auto-allocate** and **Auto-fill blanks** remain available at any time on eligible current/future dates. Started, completed, published, manual and peer cover protections, all enabled rules and the scheduled **06:29 Singapore time** cutoff remain.

## Verify and retain recovery material

Check `PATCH.json` for version `0.9.8n`, baseline `0.9.8m`, four components and committed source. Only the matched Roster frontend/backend pair is mandatory. The two Worker files are optional updates for existing installations. Read `VALIDATION.md` and verify `SHA256SUMS.txt`. Source patches and Git history are maintenance material, not Pages uploads. The unchanged separate `GSiS_v0.9.8i_Rehearsal.zip` is not part of this production installation. Revision M rehearsal work remains paused.

Calendar and Deploy retain L; other products retain J. N does not redeploy them. If their previous updates are still outstanding, use their matching earlier component files and setup guide.

## Rollback

Preserve all live records, receipts and journals. Reverting to M restores its 12,000,000-character save guard and old shorter-report review rule. If the document has grown above that guard, M can read its unchanged format but may refuse further saves. Do not prune attendance, relief accounting or recovery plans simply to force a rollback. Use a verified recovery plan before downgrading the backend; restore only a matching backed-up frontend/backend pair. Code rollback does not undo accepted absence changes, recall messages or cancel existing processing.
