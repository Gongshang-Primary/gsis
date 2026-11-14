# GSiS v0.9.9y deploy steps (hotfix on top of the live x)

Model: Claude (v0.9 coordinator). Built from main at the commit in `COMMIT.txt`. Not deployed by the builder. The owner deploys.

## What changed since x
Only one product change: **#153, ad hoc relief hotfix** (reviewed by Claude at 39728a2, merged as 7c93151).
- #38 (in x) blocked ad hoc relief teachers, who are inactive in Contacts by design, from teacher search, manual assign, auto-allocate, duty WhatsApp and the daily report's external teachers.
- y restores the rule "active in Contacts, **or** activated as ad hoc for that date and period" everywhere relief is decided or delivered. Activated teachers show "(ad hoc)" instead of "(inactive)". Staff who are inactive with no activation stay blocked, as #38 intended. A teacher deleted from Contacts still fails as before.
- Everything else is x unchanged. The v1 merges on main since x live in `v1/` and are not part of this bundle. `contacts-update/public/signature-assets/OFL.txt` (licence text) is the only other file changed; it is in the optional Contacts ZIP.

## Deploy (about 15 minutes), in this order
1. **gsis-roster-notifications** Worker ← `4_gsis-roster-notifications_worker.js` → Deploy. Keep every binding, secret, variable and cron as they are.
2. **gsis-operations** Worker ← `5_gsis-operations_worker.js` → Deploy. Keep everything as it is.
3. **Roster Pages** (gsps-roster) ← `3_Roster_Frontend.zip` → Production. `ROSTER_EDGE_AUTHORITY` stays `d1`.
4. **Optional:** Deploy Pages ← `6_Deploy_Frontend.zip`, and any `optional-label-only/*` ZIP, only to update the header label. No product change.
5. **Apps Script backends (`1_Roster_Backend.gs`, `2_Deploy_Backend.gs`):** optional. Roster runs on D1 and Google is frozen, so the live path does not use them. Deploy them only if you keep the backends at the current label (new version on the existing deployment, same URL). Skipping them is safe.

No cron, setting, template, secret or data change is needed.

## Check right after deploy (Assign Relief, 16 Nov)
1. Hard refresh. The header shows **v0.9.9y**.
2. The ad hoc chips show "(ad hoc)", not "(inactive)": Chai, Seow Yann, Fue Yan, Mai Ling, Sheila, Mawar.
3. Open an unassigned period, then Find a teacher: an ad hoc teacher appears and **Assign** works.
4. Run **Auto-allocate**. The log no longer says "received no relief: not available that period" for the ad hoc teachers. Check the proposal before publishing.
5. When you publish and notify for 16 Nov, the ad hoc teachers are included in WhatsApp.

**If you used the Contacts workaround** (Active = Y for these teachers), set them back to N **after** check 3 passes, wait about 5 minutes for the references refresh, and re-check that they still show as "(ad hoc)" and stay assignable.

## Still open from x (unchanged)
- Do not enable `system_alert` until one verified full backup and one verified restore test show in the backup ledger.

## Rollback
Redeploy the x versions of the two Workers and Roster Pages (from `deploy/2026-11-14-v0.9.9x`). No data change. Rolling back brings the ad hoc bug back; use the Contacts workaround if you must roll back.
