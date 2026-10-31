# GSiS v0.9.9e deploy (main @ COMMIT.txt)

New since v0.9.9d: the D1 import snapshot saves the compressed Roster (fixes rehearsal 2, which failed after 41 s); import failures now show their reason and step on edge-setup; Roster locks are released before the snapshot upload; the D1 backup and switch-back code is included but stays idle until D1 is activated (not part of this rehearsal). Every page shows v0.9.9e. Nothing changes for teachers.

Tests on this code: Node 911/911 and LORD 38/38 (1284af8); label, Calendar, packaging and LORD checks after the label change (8df5a92).

Deploy when Roster is quiet. About 20 minutes. Same six files and order as before.

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

## 7. Check (5 minutes)
1. Roster: Ctrl + Shift + R → header reads **v0.9.9e**.
2. Assign Relief, System Config and Storage load.
3. Deploy: Ctrl + Shift + R → header v0.9.9e.
4. LORD and Calendar load.
5. Tell Claude the time you finished.

## 8. Rehearsal import 3 (quiet time; allow 1 to 2 hours)
1. Wait 10 minutes after step 1.
2. Open `https://roster.gsps.edu.sg/edge-setup.html` → **Check status**.
3. Clear the failed attempt (import 38201eec…), as last time:
   a. Section 2: **Download private export** (keep the file private).
   b. Section 3: tick the checkbox. **Activate verified owner must stay greyed out**; if it becomes clickable, stop and tell Claude.
   c. Maintenance and recovery: **Restart incomplete import** → **Restart import**.
   d. Untick the checkbox.
4. Section 2: **Import / retry same import** → Review → Continue. Send Claude the new import reference.
5. Keep the page open. Progress shows the step and time. If it errors, it now shows the reason and step: screenshot it, then press **Import / retry same import** to resume.
6. When complete: **Check status** → screenshot → send to Claude. Claude checks D1 against Google.
7. **Never click "Activate verified owner".**

## Rollback
- Apps Script: previous version; Pages and Workers: previous deployment.
- Keep the Roster backend at v0.9.9d or later once a v2 import has started; v0.9.9e or later once rehearsal 3 has started (its source digest uses the compressed format).

## Optional: version label only
Zips in `optional-label-only/` change only the visible label for Contacts, Layout, Calendar, LORD, OVERLORD, STARLORD, Venues.
