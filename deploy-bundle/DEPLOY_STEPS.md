# GSiS v0.9.9g deploy (main @ COMMIT.txt): cutover diagnostics bundle

New since v0.9.9f:
- edge-setup **Check snapshot is current** button (drift check, usable during the import).
- An activation refusal now names what changed ("Changed since the snapshot: …").
- The import retries Google timeouts by itself (up to 10 in a row; keep the tab open).
- Every page shows v0.9.9g. Nothing changes for teachers.

Also in this bundle, **optional and not for tonight:** Calendar row 9 (venue picks up to six, faster save receipts) in `calendar-row9-together/`. LORD queue code is inside the LORD frontend but stays off until set up separately.

Deploy **before 21:15** (about 20 minutes). Same six files and order as v0.9.9f.

## 1. Roster backend (Apps Script "Roster GSiS")
Paste `1_Roster_Backend.gs` into the main file → Save → Deploy → Manage deployments → edit the existing web app → New version → Deploy. Leave `ROSTER_OPERATIONS_MAX_CHARS=24000000`.

## 2. Deploy backend (Apps Script "Deploy")
Same with `2_Deploy_Backend.gs`.

## 3. Roster frontend (Cloudflare → gsps-roster)
Upload `3_Roster_Frontend.zip` (do not unzip) → Production → green tick. The `ROSTER_EDGE_AUTHORITY=d1` variable stays as set; do not change it.

## 4 and 5. Workers
gsis-roster-notifications ← `4_gsis-roster-notifications_worker.js`; gsis-operations ← `5_gsis-operations_worker.js`. Edit code → replace all → Deploy. Their `ROSTER_EDGE_AUTHORITY=d1` variables stay.

## 6. Deploy frontend (Cloudflare → the Deploy Pages project)
Upload `6_Deploy_Frontend.zip` → Production → green tick.

## 7. Check (5 minutes)
1. Roster: Ctrl + Shift + R → header **v0.9.9g**. Assign Relief loads (Google).
2. edge-setup → **Check status**: freeze shows cancelled; section 2 shows a **Check snapshot is current** button.
3. Deploy: header v0.9.9g.
4. Tell Claude the time you finished.

## Optional later (not tonight): Calendar row 9, all three together or none
`calendar-row9-together/`: C1 Calendar Apps Script backend (paste, New version), C2 Worker gsis-calendar-jobs (replace code, Deploy), C3 Calendar Pages project (upload zip). Check: Calendar loads, an event save shows "Accepting your event proposal…" then saved.

## Rollback
- Apps Script previous version; Pages and Workers previous deployment (v0.9.9f).
- If the freeze is on and you must roll back: **Cancel freeze…** first.
- Once a v0.9.9g import has started, keep the Roster backend at v0.9.9g.
