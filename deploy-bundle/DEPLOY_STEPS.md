# GSiS v0.9.9o deploy (main @ COMMIT.txt): 10 files, on D1

Deploy after school. Venues and LORD backends unchanged: do not redeploy them.

New since v0.9.9n:
- Auto-allocate gives activated ad hoc relief teachers (and daily SREs) priority 1, and reoptimise moves unpublished automatic drafts to them (#84).
- Drive outputs/backups record the real failure reason; stuck backups recover; system alerts go to **Admins only** with Admin wording (WhatsApp template pending Meta) (#87).
- The effective timetable is always the latest **confirmed** Stapler version; saving a draft never drops the day to the baseline; the source shows on Assign Relief and Daily Notify (#91).
- Deploy publish shows the Contacts step separately with "Retry Contacts sync"; Contacts refreshes catalogues by itself (#90).
- Calendar: a save stuck over 1 hour that never landed is marked failed and the user is told to redo it (#92).
- Assign Relief Export Excel = selected day, daily workbook format, no [Published]/[Completed] tags (#93).

## A. Deploy (about 30 minutes), in this order
1. **Roster backend** (Apps Script "Roster GSiS"): paste `1_Roster_Backend.gs` into the main file (keep `EdgeAuthorityTools`) → Save → Deploy → Manage deployments → edit → New version → Deploy. Note the previous version (n).
2. **Deploy backend** (Apps Script "Deploy"): same with `2_Deploy_Backend.gs`.
3. **Contacts backend** (Apps Script "Contacts"): same with `7_Contacts_Backend.gs`.
4. **Calendar backend** (Apps Script "Calendar", bound to GSPS-CoE): same with `9_Calendar_Backend.gs`.
5. **Roster frontend** (Pages gsps-roster): `3_Roster_Frontend.zip` → Production. `ROSTER_EDGE_AUTHORITY` stays **d1**.
6. **gsis-roster-notifications** ← `4_gsis-roster-notifications_worker.js` → Deploy (keep all 5 crons and `WHATSAPP_ENABLED` as is).
7. **gsis-operations** ← `5_gsis-operations_worker.js` → Deploy.
8. **Deploy frontend** ← `6_Deploy_Frontend.zip`; **Contacts frontend** ← `8_Contacts_Frontend.zip`; **Calendar frontend** ← `10_Calendar_Frontend.zip` → Production each.
9. Check: headers show **v0.9.9o** (hard refresh); Assign Relief loads; one save works; Assign Relief shows "Timetable: Stapler plan rev N (confirmed …)" on a Stapler day.

## B. Right after deploy
1. **Stapler 10 and 12 Nov**: both have an unconfirmed draft rev 2 (confirmed rev 1). From now on Roster uses **confirmed rev 1**. SMC: open Stapler for 10 and 12 Nov and **confirm rev 2** if those edits are intended.
2. **Drive outputs, one controlled test**: System Config → tick "Enable daily Excel and Allocation Audit" → Save → wait 4 minutes → open `/backup-ledger.html`. If a row fails, it now shows the **real reason**: send it to Claude/Muse. Then untick again unless files appeared. (No WhatsApp alerts can be sent: the Admin template is still pending Meta and alerts go to Admins only.)
3. Absence reports Jenny Tan 10 Nov P10 and Yoke Yeong/Widayu 18 Nov: **Withdraw** (already covered by existing absences). "Review report" works on D1 only after the next release (p).

## C. Optional: WhatsApp buttons for 5 messages
See `docs/reference/whatsapp-v2-buttons-status.md`: replace `WHATSAPP_TEMPLATES_JSON` on gsis-roster-notifications with `docs/reference/whatsapp-templates-buttons-on.json` → Deploy. Roll back by pasting `notification-worker/templates.activation.json`.

## Rollback
Apps Script Roster, Deploy, Contacts, Calendar → previous versions; Pages (Roster, Deploy, Contacts, Calendar) and both Workers → previous deployments (n). No data migration. Rolling back soon after deploy is safe; if o has run for hours (new system-alert records, Calendar FAILED receipts), ask Claude/Muse for a quick compatibility check first.
