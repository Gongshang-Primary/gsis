# GSiS v0.9.9i deploy (main @ COMMIT.txt): cutover bundle with audit catch-up

New since v0.9.9h:
- **Audit catch-up**: after quiet mode ends, the daily allocation audit export drains every pending day in order (up to 3 per 5-minute run), so per-step detail is no longer lost (#61).
- **Cancel freeze stops the server import** for that freeze, retaining all evidence (#62).
- Every page shows v0.9.9i. Nothing changes for teachers.

Deploy **this afternoon** (about 20 minutes). Same six files and order as v0.9.9h.

1. **Roster backend** (Apps Script "Roster GSiS"): paste `1_Roster_Backend.gs` into the **main** file (keep `EdgeAuthorityTools`) → Save → Deploy → Manage deployments → edit → New version → Deploy.
2. **Deploy backend** (Apps Script "Deploy"): same with `2_Deploy_Backend.gs`.
3. **Roster frontend** (gsps-roster): upload `3_Roster_Frontend.zip` → Production. `ROSTER_EDGE_AUTHORITY` stays **legacy**.
4. **gsis-roster-notifications** ← `4_gsis-roster-notifications_worker.js` → Deploy.
5. **gsis-operations** ← `5_gsis-operations_worker.js` → Deploy.
6. **Deploy frontend**: upload `6_Deploy_Frontend.zip` → Production.

## Check (5 minutes)
1. Roster header **v0.9.9i**; Assign Relief for tomorrow loads (Google).
2. edge-setup → **Check status**: both stores **legacy**; freeze **cancelled**.
3. Deploy header v0.9.9i. Tell Claude the time.

## Fallback: back to v0.9.9h (owner rule)
If anything misbehaves after deploying i, redeploy **h** from https://github.com/helper-gsps/gsis/tree/deploy/2026-11-02-v0.9.9h/deploy-bundle (same six files, same order), or use each product's previous version/deployment. Then cut over tonight on h. On h, after any Cancel freeze, also press Restart incomplete import to stop the server import.

## Not now
`calendar-row9-together/` (another day), `optional-label-only/`.

## Tonight
`CUTOVER_TONIGHT.md`: check status 21:30, freeze and import 21:35, parity, Cloudflare d1, activate, test at +0 and +20 minutes, 02:30 hard stop.
