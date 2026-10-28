# GSiS v0.9.1b installation

Apply to the existing v0.9.1 suite with LORD v0.9.1a patch. This package updates the LORD backend and three LORD frontends, plus the Roster backend, Roster frontend and generated notification Worker. Preserve all existing Script Properties, Pages settings, URLs, secrets, booking peppers, private folders and triggers.

1. Back up the saved LORD and Roster Apps Script source and record their existing web-app deployments and the four Pages deployments.
2. In LORD Apps Script, open Services → + and add Drive API, version v3, identifier Drive. Keep Sheets API v4 enabled. If using a standard Google Cloud project, enable the Google Drive API in that project as well.
3. Replace LORD Code.gs with the complete LORD_Backend_v0.9.1b.gs, retaining the existing manifest and enabled Google Sheets API service.
4. Run selfTestLORDV17, inspectLORDPhotoUploadReadiness and diagnoseLORDBackgroundWork; investigate any failure without deleting uncertain work or retry receipts.
5. Publish a new version of the existing LORD web-app deployment, retaining its /exec URL and access configuration.
6. Replace the existing Roster combined backend with Roster_Backend_v0.9.1b.gs and publish a new version of the existing Roster web-app deployment. Keep the Roster backend role and do not upload this file to Deploy.
7. Upload each inner frontend ZIP to its matching existing Cloudflare Pages project: LORD, OVERLORD, STARLORD and Roster.
8. Replace the existing scheduled notification Worker code with Roster_Notification_Worker_v0.9.1b.txt, preserving all settings, bindings, secrets and cron schedules.
9. Reload open tabs and check the 0.9.1b labels. On a test installation verify booking text, booking open, return choices, interrupted photo upload/retry, OVERLORD diagnostics, STARLORD refresh and timetable creation/cache refresh.

The photo reliability addition requires Drive API v3 as above. There are no new Script Properties, Cloudflare bindings, secrets, worksheets or triggers. Upload manifests are recorded automatically in the existing LORD Event Log. Do not rerun blank-workbook setup, settings migration or LORD reference activation. Existing stored timetable data remains readable; new prepared data is used as source records are written. Existing Roster fallback supports older records.

PHOTO_UPLOAD_RELIABILITY.md explains retry, reconciliation and maintenance. The included appsscript.services.fragment.json declares both Sheets v4 and Drive v3; merge its dependencies if editing the manifest manually, preserving other manifest settings.

Saved source is used by triggers immediately; restoring only the published web-app version does not roll back trigger code. For rollback restore both saved source and matching prior web-app/Pages deployments while preserving valid data and settings.

The WhatsApp Report Absence menu target is an independent Cloudflare environment value: WHATSAPP_CURRENT_RELIEF_URL=https://roster.gsps.edu.sg/. Set it on Roster Pages and on the notification Worker where durable ingress/menu processing is enabled. Uploading source does not replace this value. This is an ordinary generated menu reply, not a Meta template edit. The WhatsApp Business connection cannot modify Cloudflare configuration.

No live deployment has been performed by preparation of this package. Venue setup and deployment are not included.
