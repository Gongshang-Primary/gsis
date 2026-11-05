# GSiS v0.9.9n deploy (main @ COMMIT.txt): 6 files, on D1

Runs on the live D1 setup (v0.9.9m). Deploy after school, not before a school morning. Venues backend unchanged: do not redeploy.

New since v0.9.9m:
- Scheduled D1 backups to Google Drive with a permanent ledger, verified read-back, continuity Sheet for SMC, health alerts, weekly scratch restore drill, Admin restore into an empty recovery D1 (#81).
- Daily relief Excel per school day in `01 Live Data/Roster/Daily Relief/YYYY/MM/`, updated after Auto-allocate/publish/saves, FINAL after midnight (#82).
- Allocation Audit TXT written to Drive from D1 again, same format as before; missing days since the fresh start are backfilled (#82, #85). "Why" capture removed (#85).
- Capacity warning WhatsApp wording no longer says "Health 100%" with uncovered periods (#82).
- Deploy ledger: "Target offload %" removed; FAJT Target from the saved relief budgets (#86).

## A. Deploy (about 20 minutes)
1. **Roster backend** (Apps Script "Roster GSiS"): paste `1_Roster_Backend.gs` into the main file (keep `EdgeAuthorityTools`) → Save → Deploy → Manage deployments → edit → New version → Deploy. Note the previous version (66 = m).
2. **Deploy backend**: same with `2_Deploy_Backend.gs`. Note the previous version.
3. **Roster frontend** (Pages gsps-roster): upload `3_Roster_Frontend.zip` → Production. `ROSTER_EDGE_AUTHORITY` stays **d1**.
4. **gsis-roster-notifications** ← `4_gsis-roster-notifications_worker.js` → Deploy. Then **Settings → Triggers → Cron Triggers: add two** (keep the existing three):
   - `1-59/2 * * * *` (backups, odd minutes)
   - `0-58/2 * * * *` (daily outputs, even minutes)
   If Cloudflare refuses a fifth cron (plan limit), stop and tell Claude.
   Keep `WHATSAPP_ENABLED` as it is.
5. **gsis-operations** ← `5_gsis-operations_worker.js` → Deploy.
6. **Deploy frontend** ← `6_Deploy_Frontend.zip` → Production.
7. Check: Roster and Deploy headers **v0.9.9n**; Assign Relief for today loads; one save works.

## B. Turn on daily outputs (5 minutes)
Roster → Admin → System Config → **Daily relief files on Google Drive**:
- GSiS home base folder ID: `1pVI5eS4NWxbr8Ct0-2mmYVZEQZwa68_Z`
- 01 Live Data/Roster/Daily Relief folder ID: `1SY-pUUcQWKB9auDFAbSzYhZcy90Ei4vN`
- Allocation Audit folder ID: `1imeTP73ZowWLIAWZPP_fsh7_8SbRKqZI`
- Enable → Save.
Check within 10 minutes: `Daily Relief/2026/11/<today> Relief.xlsx` appears; `Allocation Audit/2026/11/` gets the backfilled TXT files (5, 6 Nov ...). System Health shows the daily outputs rows.

## C. Turn on backups (5 minutes; scratch drill optional today)
Roster → Admin → System Config → **D1 backups to Google Drive**:
- GSiS home base folder ID: `1pVI5eS4NWxbr8Ct0-2mmYVZEQZwa68_Z`
- 01 Live Data/Roster/Backups folder ID: `1J6Ac1Cb-yj5kX3WaTAKIpZ3Riqlltnk9`
- Continuity Sheet ID: leave blank (it creates "Roster continuity"); then share that Sheet read-only with SMC.
- Enable → Save.
Check: `/backup-ledger.html` shows a verified increment within about 1 hour, a verified full after 02:15. Backups folder sharing: set by you (it holds absence reasons; Admin only where possible).
Weekly restore drill (Sunday 02:15) needs a separate disposable D1 + R2 bound on gsis-roster-notifications as `ROSTER_BACKUP_SCRATCH_DB` and `ROSTER_BACKUP_SCRATCH_BUCKET`. Not needed today; without them the drill reports a failure in System Health on Sunday. Claude gives the steps when you want them.

## Rollback
- Code: Apps Script Roster GSiS → version 66; Deploy → previous; Pages and both Workers → previous deployments (m). Remove the two new crons.
- Then tell Claude "drop backup triggers": Claude removes the D1 backup triggers (`gsis_backup_record_*`), which m does not use. m accepts the new settings (tested).
- Turning outputs/backups off in System Config stops new writes and keeps all files and ledger rows.
