# GSiS v0.9.9k deploy (main @ COMMIT.txt): cutover-ready bundle, 7 files

New since v0.9.9i (v0.9.9j contents plus #68):
- WhatsApp private links behind buttons (#68). Peer request and Stapler timetable messages switch to their approved button versions at once; the other new button templates stay off until Meta approves them. A 20-minute reminder is cancelled once the teacher has acknowledged; acknowledgements survive an identical republish; old links show current duties.
- Import: large steps are split, a step Google already finished is adopted, the real error is logged (#69). Fix for last night's step 141.
- Duplicate Stapler audit IDs: guard (#71) and Admin repair (#75, run once after deploy, below).
- Allocation cannot overlap itself (#76): stops the 3 Nov 17:59 overload.
- Venues fence: System Health shows the cause, alerts SMC/Admin after 5 minutes, Admin "Recover Venues sync" (#67). **Needs the Venues backend (file 7).**
- Consecutive limit counts every occupied period except System Config exclusions (#74). **Review the exclusion list before deploying** (today only BLK*).
- Daily relief cap per non-SRE teacher (#73), ships **Off**.
- Peer approval may exceed weekly R (#64). Home banner wording (#65). Every page shows v0.9.9k.

Deploy **16:30 to 17:30**, about 25 minutes, in this order.
1. **Roster backend** (Apps Script "Roster GSiS"): paste `1_Roster_Backend.gs` into the main file (keep `EdgeAuthorityTools`) → Save → Deploy → Manage deployments → edit → New version → Deploy.
2. **Deploy backend** (Apps Script "Deploy"): same with `2_Deploy_Backend.gs`.
3. **Venues backend** (Apps Script "Venues"): same with `7_Venues_Backend.gs`. Keep your `VenuesAdminTools` file.
4. **Roster frontend** (Cloudflare Pages gsps-roster): upload `3_Roster_Frontend.zip` → Production. `ROSTER_EDGE_AUTHORITY` stays **legacy**.
5. **gsis-roster-notifications** ← `4_gsis-roster-notifications_worker.js` → Deploy.
6. **gsis-operations** ← `5_gsis-operations_worker.js` → Deploy.
7. **Deploy frontend**: upload `6_Deploy_Frontend.zip` → Production.

## Check (5 minutes)
1. Roster header **v0.9.9k**; Assign Relief for tomorrow loads; one save works.
2. System Health: a **Venues sync** row shows **ready**.
3. edge-setup → **Check status**: both stores **legacy**, freeze **cancelled**; header shows v0.9.9k.
4. Deploy header v0.9.9k. Tell Claude the time.

## After the check: duplicate audit ID repair (#75), 3 minutes, before 21:00
Roster, signed in as Admin → browser DevTools Console (F12) → paste:
```
fetch('/api/operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'repairStaplerAuditIds',mode:'dryRun'})}).then(r=>r.json()).then(x=>console.log(JSON.stringify(x)))
```
Expect `pairs: 1` and a `previewDigest`. Send the output to Claude. Claude gives you the exact apply line (it carries a fixed request ID and that digest). Must be applied **before the freeze**.

## Fallback
Apps Script previous version; Pages and Workers previous deployment (v0.9.9i). If you roll back the Roster backend, roll back the Venues backend too.

## Not in this bundle
LORD (#77) is deployed separately. Calendar row 9 stays as in the v0.9.9i bundle. `optional-label-only/` = frontends whose only change is the label.
