# GSiS 0.9.8o setup

Revision O builds on N (`e340bff68ab985f2f6a3434dd06c8a01ea936a0a`). It prepares native timetables in the Cloudflare rehearsal storage you already tested. **Google remains authoritative.** There is no production timetable or relief-ledger migration in this package.

| Installation | Files | Purpose |
| --- | --- | --- |
| Roster export addition | `Roster_Backend_v0.9.8o.gs` and `Roster_Frontend_v0.9.8o.zip` | Administrator-only timetable export; required to use preparation |
| Calendar repair, optional | `Calendar_Backend_v0.9.8o.gs` and `Calendar_Frontend_v0.9.8o.zip` | Repair sync preflight and continue eligible events around a blocked event save |
| Isolated preparation, separate package | `GSiS_v0.9.8o_Timetable_Preparation.zip` | Import and verify native timetable copies in existing rehearsal D1/R2 |

Notification and Operations Workers remain N. Their production code does not need upgrading for O. Deploy stays L; Contacts, Layout, LORD, Overlord, Starlord and Venues retain their existing versions. Keep all existing production properties, secrets, URLs, domains, bindings and schedules.

## 1. Install the Roster export addition

Before refreshing Roster, save or record any unsaved planning work. Keep a copy of the current backend code and deployed version. Preserve every Script Property, the working `GSIS_SECRET` including a working 33-character value, Google IDs and the existing web-app URL.

Open the existing Roster Apps Script project. Replace the combined code with `Roster_Backend_v0.9.8o.gs` and save. Click **Deploy → Manage deployments → pencil → New version → Deploy**. Keep the existing `/exec` URL. Saving the editor alone does not update the deployed web app.

Open Cloudflare **Workers & Pages → your existing Roster Pages project → Create deployment**. Upload the inner `Roster_Frontend_v0.9.8o.zip`. Preserve the project's settings. Refresh Roster after deployment.

N's absence-intake repair is included: bounded 16,000,000-character headroom in the existing Google document, surgical working copies, and the guarded later-report default for the original reporter. O does not delete retained reports or undo saved absences. Critical absence reporting, relief saving and normal scheduled processing remain on the existing production pipeline.

## 2. Download a private native timetable snapshot

Sign in to Roster as an administrator. Open **System Health → Prepare timetable migration → Download timetable snapshot**. Keep the tab open while the source manifest, bounded parts and final source check finish. The page is `/timetable-preparation.html` on the Roster origin.

The JSON bundle contains timetables and staff names; keep it private. It covers Singapore today through 30 days ahead, inclusive: **31 dates**. It contains relevant native baselines and confirmed intended Stapler plans. A later unconfirmed draft is excluded. A confirmed plan remains independent of a changed or missing baseline.

If a source changes during the export, start a fresh download. Exporting does not change source records, drain intake, allocate, publish or send messages. The source check is a read-only observation in the downloaded file. It does not certify that the imported copy remains current after a later Google edit, and does not authorize a cutover.

## 3. Update the existing rehearsal Worker

Open the separate `GSiS_v0.9.8o_Timetable_Preparation.zip` and follow [Timetable preparation setup](TIMETABLE_PREPARATION_SETUP.html). It gives the exact existing Worker, D1, R2 and binding names, additive SQL steps, import checks and rehearsal rollback.

Use the existing **gsis-roster-rehearsal** Worker, its tested D1 database and private R2 bucket. Preserve their instance markers and the old synthetic data. O adds separate preparation tables and an object prefix. It needs no new storage resources, production authority flags, shared key, queue or cron. The server-side Google key fetch correction from your I rehearsal report is included; browser redirect handling stays intact.

Import the private JSON bundle in that rehearsal page. Require a verified readback result with matching native timetable comparisons. Refresh stored status and inspect a dated compressed copy. Follow the guide's exact-retry and stale-revision checks. These are preparation checks on imported snapshots; production users continue through Google.

## 4. Optional: install the Calendar repair pair

The live workbook's missing `Events!AE1` header, `VenueID`, was added and checked. Event values and the two unknown save receipts were preserved. That small live sheet repair is separate from deploying the O Calendar code. Earlier sync errors remain part of their recorded run.

Back up the current Calendar code and deployed version. Replace its combined Apps Script code with `Calendar_Backend_v0.9.8o.gs`, save, then click **Deploy → Manage deployments → pencil → New version → Deploy**. Keep the same `/exec` URL, Script Properties, spreadsheet/calendar IDs, permissions and triggers.

Open the existing Calendar Pages project in Cloudflare. Create a deployment using the inner `Calendar_Frontend_v0.9.8o.zip`. Keep backend and frontend matched, preserve settings, then refresh Calendar. Google Sheets remains its source through native `SpreadsheetApp`; this repair does not activate the Advanced Sheets API or a Calendar job Worker.

Select the intended year and click **Sync Staff** once. If the previous session resumes, let that processing pass finish. Its earlier 30 errors can remain visible. Click **Sync Staff** again explicitly after it finishes to retry earlier failed records; they are not automatically retried within the same run.

Check writes, errors and blocked records separately. A completed processing pass with blocked records is not a fully synced year. An unresolved event save blocks that event while eligible events continue; an unresolved year publication still blocks the entire sync. Preserve unknown receipts and investigate their original operations. Do not delete journal rows or mark unknown outcomes successful to clear a warning.

The live header repair was verified. The O Calendar code has not been deployed or used here to write live Calendar events, and a complete live sync has not been verified. Read `CALENDAR_SYNC_REPAIR.md` for the retained operation references and detailed checks.

## 5. Before any future authority handover

Baseline models identify teachers by timetable name. This export does not include a verified current Contacts staff-ID or Name Bridge mapping. Confirmed plans retain their saved staff IDs, but current user identity and access rights still need verification. Before any teacher-facing Cloudflare consumer becomes authoritative, verify the current Contacts mappings, Calendar school-day and odd/even parity, and each consumer's permissions. A venue consumer must receive only permitted occupancy, including necessary occupying staff names, with no drafts or unrelated private details.

A later cutover must fence all baseline and Stapler writers, verify a final current-source import, route consumers, maintain source-change updates and Singapore rollover, and provide recovery retention and asynchronous Google backup. O does not implement or activate that handover. The relief-assignment ledger remains outside this preparation.

## 6. Verify the package and keep recovery files

Check `PATCH.json`: version `0.9.8o`, baseline `0.9.8n`, four production components. The Roster pair enables export; the Calendar pair is optional for the separate sync repair. Read `VALIDATION.md` and verify `SHA256SUMS.txt`. Source patches and Git recovery files are maintenance material, not Pages uploads. Worker modules from the preparation ZIP belong only to the rehearsal Worker.

## Rollback

Restore an affected product's backed-up backend/frontend versions together, keeping school records, receipts, journals and settings. Returning Roster to N removes the export addition while retaining N's intake repair. Returning to pre-N code can restore the old 12,000,000-character save guard and block a document that has grown beyond it.

For preparation rollback, restore the saved, tested I rehearsal Worker version. Keep its existing storage, markers and synthetic tables; O's private preparation data can remain stored. Do not delete D1 or R2 as a rollback step. Code rollback does not undo accepted records, settle unknown saves or recall messages.
