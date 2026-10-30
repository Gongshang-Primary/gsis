# GSiS v0.9.9b deploy (main @ COMMIT.txt)

New since v0.9.9a (30 Oct): SRE with a timetable uses the FAJT R calculation; collapsible Teaching group exceptions; Excel relief cells read "Art (for Nisha)"; published-time chip on Assign Relief; readable delivery times; SIUE for PE, Art and Music in Relief Settings; FAJT shown as supplementary in Deploy specialist figures; every page shows v0.9.9b and loads fresh files.

Tests on this code: Node 884/884, LORD 38/38.
Deploy when Roster is quiet. About 20 minutes. Do the steps in order.

**Ship steps 1, 2, 3 and 6 together in one sitting.** The relief calculation version changed. If one half is old and the other new, Relief Settings or Roster calculations will refuse to load (like the 30 Oct System Config error) until all four are updated.

## 1. Roster backend (Apps Script "Roster GSiS")
1. Open the project → select all code in the main file → paste `1_Roster_Backend.gs` → Save.
2. Deploy → Manage deployments → edit the existing web app deployment → Version: New version → Deploy. Same deployment, same /exec URL.
3. Script Properties: `ROSTER_OPERATIONS_MAX_CHARS` = `24000000` is already set. Leave it.

## 2. Deploy backend (Apps Script "Deploy")
Same as step 1 with `2_Deploy_Backend.gs`.

## 3. Roster frontend (Cloudflare → Workers & Pages → gsps-roster)
1. Create deployment → upload `3_Roster_Frontend.zip` (do not unzip) → **Production** → Deploy.
2. Wait for the green tick. A red triangle means it failed: click Details and send Claude a screenshot.

## 4. Worker gsis-roster-notifications
Edit code → replace all with `4_gsis-roster-notifications_worker.js` → Deploy.

## 5. Worker gsis-operations
Same with `5_gsis-operations_worker.js`.
These two Workers also serve LORD, Calendar and Layout (their code for those apps is unchanged).

## 6. Deploy frontend (Cloudflare → the Deploy Pages project)
Create deployment → upload `6_Deploy_Frontend.zip` (do not unzip) → **Production** → Deploy. Wait for the green tick.

## 7. Check (5 minutes)
1. Roster: press Ctrl + Shift + R. The header reads **v0.9.9b**.
2. Roster → System Config loads. "Teaching group exceptions" is folded with a count.
3. Roster → Assign Relief: a chip beside "Let teachers see" reads "Published HH:MM" or "Not published".
4. Deploy: press Ctrl + Shift + R → Relief calculations → Relief Settings shows "SIUE for PE / Art / Music (%)", all blank.
5. Open LORD and Calendar once each: both load.
6. Tell Claude the time you finished. Claude checks D1 job health.

## Optional: version label only (any later day)
Contacts, Layout, Calendar, LORD, OVERLORD, STARLORD and Venues changed only their visible label (v0.9.9 → v0.9.9b). Upload the matching zip from `optional-label-only/` to each Pages project (Production) whenever convenient. Nothing breaks if you skip it.

## New settings (no action needed)
- Relief Settings: SIUE for PE / Art / Music. Blank uses the general SIUE, so R is unchanged until you enter a value.
- Deploy workload: specialist headcount, capacity and average now exclude FAJT; a new "FAJT supplementary" column shows their periods.
- SRE with a Deploy timetable: weekly R on the FAJT basis; ranked by weekly use, not annual history.

## Rollback
- Apps Script: Manage deployments → edit → previous version → Deploy.
- Pages: Deployments → previous production deployment → Rollback.
- Workers: Deployments → previous version → Rollback.
Roll back 1, 2, 3 and 6 together. Workers 4 and 5 can roll back on their own.
