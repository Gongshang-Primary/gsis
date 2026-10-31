# GSiS v0.9.9c deploy (main @ COMMIT.txt)

New since v0.9.9b: finished machine output older than 30 days moves nightly to monthly archive files in the Roster data folder (old message text, old request receipts, allocation run evidence, system audit entries, resolved SMC alerts). All school records stay in the main file. Admin → Prune records now shows Storage with "Archive now", monthly archive totals and "Open archived copy". Every page shows v0.9.9c.

Tests on this code: Node 891/891 (00e3b09), LORD 38/38 and label/Calendar/packaging checks (ef037a2).

Deploy on a school day **before 4 pm** if you can (see Rollback). About 20 minutes. Same six files and order as last time.

## 1. Roster backend (Apps Script "Roster GSiS")
Paste `1_Roster_Backend.gs` into the main file → Save → Deploy → Manage deployments → edit the existing web app → New version → Deploy. Leave Script Property `ROSTER_OPERATIONS_MAX_CHARS=24000000`.

## 2. Deploy backend (Apps Script "Deploy")
Same with `2_Deploy_Backend.gs`.

## 3. Roster frontend (Cloudflare → gsps-roster)
Create deployment → upload `3_Roster_Frontend.zip` (do not unzip) → Production → wait for the green tick.

## 4 and 5. Workers
gsis-roster-notifications ← `4_gsis-roster-notifications_worker.js`; gsis-operations ← `5_gsis-operations_worker.js`. Edit code → replace all → Deploy.

## 6. Deploy frontend (Cloudflare → the Deploy Pages project)
Upload `6_Deploy_Frontend.zip` → Production → green tick.

## 7. Check (5 minutes)
1. Roster: Ctrl + Shift + R → header reads **v0.9.9c**.
2. Roster → Prune records: a **Storage** page with the size, monthly archive totals (empty at first) and an **Archive now** button. Do not press it yet.
3. Assign Relief and System Config load.
4. Deploy: Ctrl + Shift + R → header v0.9.9c.
5. LORD and Calendar load.
6. Tell Claude the time you finished.

## First archive run
It runs by itself once each evening between 4 pm and midnight, moving at most 2,000,000 characters a night. Only items older than 30 days move, so the first nights may move little. Next morning, open Prune records → Storage and send Claude a screenshot.

## Rollback (read this)
- **Before the first evening run** (before 4 pm on deploy day): normal rollback is safe. Apps Script previous version; Pages and Workers previous deployment.
- **After the first run:** do not roll the Roster backend back to v0.9.9b. That version cannot read archived items. Roll back only to a backend that includes the archive reader (v0.9.9c or later). Frontends and Workers can still roll back.
- Archive files are named `Roster archive YYYY-MM.json` in the Roster data folder. Never delete them.

## Optional: version label only
Contacts, Layout, Calendar, LORD, OVERLORD, STARLORD, Venues: zips in `optional-label-only/` change only the visible label. Upload any day.
