# Install GSiS v0.9.8d

Baseline: 0.9.8c Google-authoritative recovery installation. No migration, new database, binding, secret, cron or Operations Worker is required. The active relief ledger remains on hold.

1. Keep the current Roster backend, Roster Pages, notification Worker and LORD backend versions for rollback.
2. Open the existing **Roster Apps Script** project. Replace its combined code with `Roster_Backend_v0.9.8d.gs`, save, then **Deploy → Manage deployments → pencil → New version → Deploy**. Retain the existing web-app URL, execute-as-owner setting, access and Script Properties.
3. In **Cloudflare → Workers & Pages → gsis-roster-notifications → Edit code**, replace the code with `Roster_Notification_Worker_v0.9.8d.txt` and deploy. Keep existing secrets, bindings, send settings and triggers.
4. Upload `Roster_Frontend_v0.9.8d.zip` as a new deployment of the existing **Roster Pages** project. Do not upload the outer release ZIP. Refresh Roster; its header should show v0.9.8d.
5. Open the existing **LORD Apps Script** project. Replace its combined backend code with `LORD_Backend_v0.9.8d.gs`, save, then deploy a new version of the existing web app. Keep the `syncLORDGSiSReferences` time trigger and existing properties. Do not create another trigger. Its time-based Head execution uses the saved code. Existing Advanced Services settings are unchanged; the included services fragment is reference material, not a required new setup.

## Clear the intake backlog through processing

The next scheduled/Queue drain can attempt up to eight receipts within its existing time budget. Unsaved attendance is prioritized. Previously retained, unapplied reports with the exact safe failure code `ABSENCE_OVERLAP` get one automatic attempt under the new merge rules. No original report or saved absence is erased. Old reports lacking that code, different conflicts and shorter-coverage decisions are not blindly accepted.

In **Assign Relief → Received reports**, use **Check status** after processing. Completed compatible repeats cease blocking allocation. For a shorter report, the reporter or SMC uses **Choose coverage** to keep the existing coverage or use the shorter report. A concurrent saved change forces a fresh review. Past/shared/protected arrangements may still need **Manage reported absences**.

A received report is not necessarily saved. Confirm its status reaches **Absence saved**. Technical failures retain the same request and retry; do not repeatedly submit new reports. Check **System Health → Relief allocation** after the backlog clears. A new successful/idle outcome must be assessed against the current due work; old failure history remains.

## Notification and LORD checks

In **Daily Notify → WhatsApp delivery issues**, unresolved uncertainty is separate from reviewed outcomes retained in history. **Clear shown alerts** closes only those exact issues. It sends nothing and does not confirm delivery. Existing pending-notification cancellation remains Admin-only. This patch does not establish why the earlier morning WhatsApp attempts were uncertain.

For LORD, a busy reference-sync lock now logs `lord-reference-sync-deferred`. The next existing trigger retries. Deferral does not refresh the last-success timestamp; genuine upstream errors still fail. The observed 9.98% is the trigger error-rate display, not evidence that 9.98% of bookings failed.

## Acceptance and rollback

After installing matched Roster components, check a controlled report, its receipt, a same-details repeat, a later instruction update, a relief save and the next scheduled allocation. Confirm actual WhatsApp delivery separately with the recipient/provider record. Local synthetic tests cannot verify production bindings, permissions or provider delivery.

No live deployment or messages were performed when preparing this package. To roll back code, restore the three Roster 098c components together and the previous LORD backend. Retain receipts, audit history, properties, queues and caches; code rollback does not undo saved records or submitted messages. Additive ordering/review metadata does not require a schema migration.
