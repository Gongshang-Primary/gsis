# GSiS v0.9.9f deploy (main @ COMMIT.txt) — cutover bundle

New since v0.9.9e: the **cutover freeze** (edge-setup "Freeze Google for cutover…" and "Cancel freeze…"): Google Roster writers pause with "Roster is being moved", background jobs skip, absence reports stay queued; activation lifts it. Contacts Edit Info gets a "Find by TTb name" filter. Every page shows v0.9.9f. Nothing changes for teachers until the freeze is used.

Tests on this code: Node 919/919 and LORD 38/38 (84a71b5); label, Calendar, packaging and LORD checks after the label change (8980205).

Deploy **by 17:00 today**. About 20 minutes. Same six files and order as before.

## 1. Roster backend (Apps Script "Roster GSiS")
Paste `1_Roster_Backend.gs` into the main file → Save → Deploy → Manage deployments → edit the existing web app → New version → Deploy. Leave Script Property `ROSTER_OPERATIONS_MAX_CHARS=24000000`.

## 2. Deploy backend (Apps Script "Deploy")
Same with `2_Deploy_Backend.gs`.

## 3. Roster frontend (Cloudflare → gsps-roster)
Upload `3_Roster_Frontend.zip` (do not unzip) → Production → wait for the green tick.

## 4 and 5. Workers
gsis-roster-notifications ← `4_gsis-roster-notifications_worker.js`; gsis-operations ← `5_gsis-operations_worker.js`. Edit code → replace all → Deploy.

## 6. Deploy frontend (Cloudflare → the Deploy Pages project)
Upload `6_Deploy_Frontend.zip` → Production → green tick.

## 7. Optional now: Contacts frontend
Contacts gains the TTb filter: upload `optional-label-only/Contacts_Frontend.zip` to the Contacts Pages project (Production). The other optional zips change only the label.

## 8. Check (5 minutes)
1. Roster: Ctrl + Shift + R → header **v0.9.9f**.
2. Assign Relief, System Config and Storage load.
3. edge-setup → **Check status**: a "Freeze Google for cutover" section appears, freeze not active. **Do not press it yet.**
4. Deploy: Ctrl + Shift + R → header v0.9.9f.
5. LORD and Calendar load.
6. Tell Claude the time you finished.

## Tonight
Follow `CUTOVER_RUNBOOK.md` (in this folder): staff notice 18:45; freeze then import from 19:00; parity check; activate; test; **23:00 go/no-go**.

## Rollback
- Apps Script previous version; Pages and Workers previous deployment.
- If the freeze is on and you must roll back: **Cancel freeze…** first.
- Once a v0.9.9e/f import has started, keep the Roster backend at that version or later.
