# GSiS v0.9.9d deploy (main @ COMMIT.txt)

New since v0.9.9c: the D1 import now prepares in short resumable steps (fixes the 31 Oct rehearsal failure); edge-setup shows step progress and time; allocation audit archives become immutable versions. Every page shows v0.9.9d. Nothing changes for teachers.

Tests on this code: Node 897/897 and LORD 38/38 (396546d); label, Calendar, packaging and LORD checks after the label change (5c202c0).

Deploy when Roster is quiet. About 20 minutes. Same six files and order as last time.

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
1. Roster: Ctrl + Shift + R → header reads **v0.9.9d**.
2. Assign Relief, System Config and Storage (Prune records) load.
3. Deploy: Ctrl + Shift + R → header v0.9.9d.
4. LORD and Calendar load.
5. Tell Claude the time you finished.

## 8. Rehearsal import (quiet day or evening; allow 1 to 2 hours)
1. Wait 10 minutes after step 1 so any older Apps Script runs finish.
2. Open `https://roster.gsps.edu.sg/edge-setup.html` → **Check status**. The page reports the failed 31 Oct attempt.
3. Use **Restart incomplete import** (this is the explicit restart; it keeps the old evidence and clears its locks). Then **Import / retry same import** → Review → Continue.
4. Progress shows "Preparing: step N of M · time". Keep the page open. If you close it or it errors, reopen and press **Import / retry same import**: it resumes.
5. Roster may answer "saving another change, retry" for up to half a minute at the very start. Otherwise Roster works normally throughout.
6. When it says complete: **Check status** → screenshot → send to Claude, with the import reference. Claude checks D1 against Google.
7. **Never click "Activate verified owner".**

## Rollback
- Apps Script: previous version; Pages and Workers: previous deployment.
- Keep the Roster backend at v0.9.9c or later (archive reader).
- Once a v0.9.9d import has started, keep the Roster backend at v0.9.9d or later; older code cannot resume its checkpoints.

## Optional: version label only
Zips in `optional-label-only/` change only the visible label for Contacts, Layout, Calendar, LORD, OVERLORD, STARLORD, Venues.
