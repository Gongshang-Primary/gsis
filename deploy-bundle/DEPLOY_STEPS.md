# GSiS v0.9.9h deploy (main @ COMMIT.txt): D1 cutover attempt 3 bundle

New since v0.9.9g (all for tonight's cutover; nothing changes for teachers on Google):
- edge-setup: **Reset D1 after manual rollback**, **Archive retained import sessions** (cap 24), import runs on the server, **Check snapshot is current** works while frozen.
- Roster on D1 reads published Deploy from Google; Contacts permissions refresh every minute; peer mail stays quiet on D1; Google backup runs only in the Worker.
- Stapler shows "Suspended Timetable Advance PLannER" (typo fix). Every page shows v0.9.9h.

Deploy **by 21:15**. About 20 minutes. Same six files and order.

## 1. Roster backend (Apps Script "Roster GSiS")
Paste `1_Roster_Backend.gs` into the **main** file (leave your separate `EdgeAuthorityTools` file as it is) → Save → Deploy → Manage deployments → edit → New version → Deploy. Keep `ROSTER_OPERATIONS_MAX_CHARS=24000000`.
If `EdgeAuthorityTools` is missing, add it from `emergency/EdgeAuthorityTools.gs` as a new script file.

## 2. Deploy backend (Apps Script "Deploy")
Same with `2_Deploy_Backend.gs`.

## 3. Roster frontend (Cloudflare → gsps-roster)
Upload `3_Roster_Frontend.zip` (do not unzip) → Production → green tick. `ROSTER_EDGE_AUTHORITY` stays **legacy** until step 5 of the cutover.

## 4 and 5. Workers
gsis-roster-notifications ← `4_gsis-roster-notifications_worker.js`; gsis-operations ← `5_gsis-operations_worker.js`. Edit code → replace all → Deploy. Variables stay **legacy**.

## 6. Deploy frontend (Cloudflare → Deploy Pages project)
Upload `6_Deploy_Frontend.zip` → Production → green tick.

## 7. Check (5 minutes)
1. Roster: Ctrl + Shift + R → header **v0.9.9h**. Assign Relief for tomorrow loads (Google).
2. edge-setup → **Check status**: buttons **Reset D1 after manual rollback** and **Archive retained import sessions** appear.
3. Deploy: header v0.9.9h.
4. Tell Claude the time.

## Not tonight
`calendar-row9-together/` (three files together, another day). `optional-label-only/` (label only; LORD carries inert queue code).

## Tonight
`CUTOVER_TONIGHT.md`: reset and archive 21:30, freeze and import 21:45, parity, Cloudflare d1, activate, test at +0 and +20 minutes, **02:30 hard stop**.

## Rollback
Apps Script previous version; Pages and Workers previous deployment (v0.9.9g). If frozen: **Cancel freeze…** first.
