# GSiS deploy, main @ COMMIT.txt (allocator fix, quiet mode, short WhatsApp, chunked D1 import, relief counted as done, Assigned By names, HAL tag, daily SRE priority, storage cap, accurate storage report)

Deploy when Roster is quiet (after the last period, evening or weekend). About 20 minutes. Do the steps in order.
Full test suite on this code: 878/878, LORD 38/38 (all green).

## 1. Roster backend (Apps Script "Roster GSiS")
1. Open the project → select all code in the main file → paste `1_Roster_Backend.gs` → Save.
2. Deploy → Manage deployments → edit the existing web app deployment → Version: New version → Deploy.
   Keep the same deployment (same /exec URL). Do not create a new deployment.

## 2. Deploy backend (Apps Script "Deploy")
Same as step 1 with `2_Deploy_Backend.gs`.

## 3. Roster frontend (Cloudflare Pages, roster.gsps.edu.sg)
1. Workers & Pages → the Roster Pages project → Create deployment → Upload `3_Roster_Frontend.zip` (do not unzip) → Deploy to production.
2. Check bindings are still present: GSIS_JOBS (D1), ROSTER_TIMETABLE_SNAPSHOTS (R2). The D1 import needs the R2 binding.

## 4. Worker gsis-roster-notifications
Workers & Pages → gsis-roster-notifications → Edit code → replace all with `4_gsis-roster-notifications_worker.js` → Deploy.

## 5. Worker gsis-operations
Same with `5_gsis-operations_worker.js`.
These two Workers also serve LORD, Calendar and Layout. Their code for those apps is unchanged, but check them in step 6.

## 5b. Deploy frontend (Cloudflare Pages, the Deploy site)
Workers & Pages → the Deploy Pages project → Create deployment → upload `6_Deploy_Frontend.zip` (do not unzip) → Deploy to production.

## 5c. HAL tag (after 1 to 5b, in this order; Admin, in the Deploy site)
1. Open the Deploy version you normally publish → HR Terms tab → in the "Employment Modifier" box, add a new line `HAL` → click outside the box.
2. Offload tab → Add rule → a new row appears. Fill it in:
   Group / tag: `HAL` · Match field: `Staff tag` · Matching value: `HAL` (pick from the list) · Offload %: `30` · leave the rest blank.
   (Copy the existing BT row: it is the same shape with 20%.)
3. Teachers tab → the teacher → Employment Modifier. Full-timers have it blank: enter `HAL`. If it already has a value (e.g. `4/5`), make it `4/5, HAL`.
4. Save and publish the version as you normally do, so Roster sees it.
Check: the teacher's Details show offload 20% SH and 30% HAL stacking, (1−0.2)×(1−0.3).
Never add HAL to anyone before this deploy: the old code cannot read it and would blank R for all staff.

## 5d. Storage cap (Roster backend, after step 1)
1. Apps Script "Roster GSiS" → Project Settings (gear) → Script Properties → Add property:
   `ROSTER_OPERATIONS_MAX_CHARS` = `20000000` → Save.
   Allowed range 16000000 to 24000000; anything else falls back to 16000000.
2. Retry the 4 held absence reports: Roslinda, Shirley, Yating (30 Oct) and Shi Yin (5 to 6 Nov).
3. Roster → "Prune historical records" → the preview shows the new Storage tables. Screenshot them and send to Claude.
   **Do not press "Prune these records".** The preview alone removes nothing.
20M buys only a few days at the current growth (about 1.5M a day). The storage report tells us what is growing; the split-file task removes the cap for good.

## 5e. Daily SRE priority (no action needed)
Settings → Daily workload limits shows "Ad hoc relief max periods" (initial 10, On). Daily SREs are allocated first; they show "Daily roster, no R%".

## 6. Check (5 minutes)
1. Open roster.gsps.edu.sg → Assign Relief: a "Quiet mode" button appears for SMC/Admin. Turn it on, then off.
2. Publish one test relief to yourself → WhatsApp reads "1 relief duty: P<n>."
3. Open LORD and Calendar once each: both load and show today's data. If either is broken, roll back the two Workers only.
4. Tell Claude the time you finished. Claude checks D1 job health for new failures.

## Rollback
- Apps Script: Manage deployments → edit → choose the previous version → Deploy.
- Pages: Deployments → previous production deployment → Rollback.
- Workers: Deployments → previous version → Rollback.
Roll back all six together, unless only LORD/Calendar broke (then the two Workers only).

## Later (not part of this deploy): D1 import
Evening only. roster.gsps.edu.sg/edge-setup → Roster migration → Import. It locks Roster briefly at the start, then copies in pieces. Nothing reads D1 yet; a failure has no user effect. Tell Claude when done for the D1 vs Google check.
