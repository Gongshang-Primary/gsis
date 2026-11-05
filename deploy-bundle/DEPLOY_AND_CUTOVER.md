# GSiS v0.9.9m: deploy and D1 fresh start in ONE session (operational Fri 6 Nov)

Files: 6 to deploy (Venues backend identical to j: no change). m is built to run on **D1**. On Google alone its Assign Relief read times out (as l did). So deploy m only right before the fresh start, and never leave m running on Google for a school morning.

New since v0.9.9j (live now): #80 allocation clock/dependency scope; #78 Stapler plans own their day; #79 D1 fresh start with Admin opening balances; #68 WhatsApp buttons.

Page: `https://roster.gsps.edu.sg/edge-setup.html` (signed in as Admin). Start date: **2026-11-06**. Opening balances as of **2026-11-05**.
Estimate: 75 to 120 minutes of clicks and data entry. Message Claude at each ★.

## A. Before you start (still on j, 10 minutes)
1. Google Roster on j: export or screenshot the **fairness totals** per teacher (quota and relief done, Statistics/R%). This is your check list and the paste fallback for opening balances.
2. List every absence dated **6 Nov or later** (Received reports / Assign Relief per date). This is your re-entry list. Include Nurathirah if still relevant.
3. Have the current **baseline timetable** file ready to upload (2026 T4 post-psle wef 28 Oct, the active one).
4. Note the 6 Nov **Stapler plan** contents if you will redo it (screenshot of the plan).

## B. Deploy m (about 15 minutes)
1. Roster backend (Apps Script "Roster GSiS"): paste `1_Roster_Backend.gs` into the main file (keep `EdgeAuthorityTools`) → Save → Deploy → Manage deployments → edit → New version → Deploy. **Note the previous version number** (rollback target, j with hotfix).
2. Deploy backend: same with `2_Deploy_Backend.gs`. Note previous version.
3. Roster frontend (Pages gsps-roster): upload `3_Roster_Frontend.zip` → Production. `ROSTER_EDGE_AUTHORITY` still **legacy**.
4. gsis-roster-notifications ← `4_…worker.js` → Deploy. 5. gsis-operations ← `5_…worker.js` → Deploy. 6. Deploy frontend ← `6_Deploy_Frontend.zip` → Production.
7. Check: Roster header **v0.9.9m**; edge-setup header v0.9.9m. (Assign Relief may time out on Google now: expected, do not test it.) ★

## C. Fresh start on D1 (edge-setup)
1. **Check status**. Heads from attempt 4 are still active: **Maintenance → Reset D1 after manual rollback** → confirm. Check status again: both stores legacy / reset. ★ (send the status line)
2. **Download private export** (archive copy; keep in restricted storage).
3. Apps Script Roster GSiS → run `venuesFenceDiagnose` → expect ready, no pending. ★
4. **Freeze Google for cutover…** → confirm.
5. **2 · Start without history**: Start date `2026-11-06`; tick **Copy System Config and name bridges from frozen Google** → **Start fresh on D1…** → type `START FRESH` → Continue. Wait for "prepared/imported". ★
6. Cloudflare: `ROSTER_EDGE_AUTHORITY=d1` in 3 places: Pages gsps-roster (Settings → Variables → Save, then Deployments → **Retry deployment**), gsis-roster-notifications (Save and Deploy), gsis-operations (Save and Deploy).
7. **3 · Activate**: tick the export/bindings box → **Activate verified owner**. ★

## D. Set up D1 (in this order; Auto-allocate is locked until step 2 is confirmed)
1. **Timetable**: Roster → upload the baseline timetable (normal upload). It becomes active for its dates. Check: Assign Relief for 6 Nov shows the day's periods and teachers.
2. **Opening balances** (Admin → Opening balances):
   - As-of date 2026-11-05 → **Propose balances from frozen Google**. If it times out: paste the two columns from your A1 file → **Preview paste**.
   - Review differences → **Apply matched rows to grid** → check against A1 → reason "Fresh start 6 Nov" → **Save opening balances** → **Confirm all opening balances**. ★ (screenshot of totals)
3. **Absences**: re-enter every absence from A2 (6 Nov first).
4. **Stapler plan 6 Nov** (if needed): create from the new baseline, redo the changes, confirm.
5. **Auto-allocate 6 Nov** → note periods filled and the time. **Reload twice**: the count must not change. ★
6. Publish / "Let teachers see" as normal when ready (this also ends quiet mode). Tell Claude "end quiet" if you want it ended earlier.

## E. +20 minutes
Assign Relief loads (note seconds); one manual save works; System Health: no new failures. ★ → Go.

## Rollback (any failed check; tell Claude first if you can)
- **Before C7 (not activated)**: **Cancel freeze…** → Apps Script Roster GSiS and Deploy → previous versions (j); Pages and both Workers → previous deployments (j). Google is untouched.
- **After C7 (activated)**: edge-setup **Switch back to Google…** (pauses D1, keeps a re-entry report) → Cloudflare `legacy` in 3 places (Pages: Retry deployment) → then all code back to j as above. Re-enter D1 changes from the report on Google.
- **Emergency (page will not work)**: Cloudflare `legacy` in 3 places → Apps Script Roster GSiS → run `edgeAuthorityRollbackToLegacy` → code back to j → `venuesFenceDiagnose`.
- Never leave m on Google for a school morning: its Assign Relief read times out.

## Never
Never activate without the fresh-start "prepared" result; never Auto-allocate before opening balances are confirmed (it is locked anyway); never re-run Start fresh after activation.
