# Roster: making D1 the record (runbook, v0.9.9e)

Owner: Song Wee (does every click). Checks: Claude (D1 queries, job health). Written 31 Oct 2026 21:45 SGT for a dawn session on Sunday 1 Nov. Applies to v0.9.9e (main 8df5a92) and later.

**Shape of the session:** one fresh import, Claude's parity check, activation, then a test window. If every check passes, D1 stays the record. If any check fails, switch back to Google in the same session. Allow 2 to 2.5 hours. Do it while nobody uses Roster.

**Facts that make this safe:**
- The Cloudflare setting `ROSTER_EDGE_AUTHORITY=d1` alone never moves Roster to D1. Roster switches only after D1 records a proven activation (`resolveRosterAuthorityEnvironment`).
- Activation first fences Google (Apps Script refuses Roster saves), then marks D1 active. If the fence cannot be proven, D1 stays inactive.
- Switch-back ("Switch back to Google…") pauses D1, waits until the Google backup has every change, checks digests, then lifts the Google fence. It refuses if it cannot prove that.

## 0. Before you start (5 minutes)
- [ ] v0.9.9e is deployed (Roster header shows v0.9.9e).
- [ ] Nobody is using Roster. No absence report is pending (Manage school-wide absences → Reports to resolve is empty).
- [ ] Claude is reachable in this chat. Send "starting cutover".
- [ ] You have the Cloudflare dashboard open: Workers & Pages.

## 1. Fresh import (35 to 45 minutes)
Last night's rehearsal copy is out of date (Google changed overnight), so import again.
1. `https://roster.gsps.edu.sg/edge-setup.html` → **Check status**.
2. If an import is retained: section 2 **Download private export** (keep it private) → section 3 tick the box (**Activate stays greyed**) → **Restart incomplete import** → **Restart import** → untick the box.
3. Section 2 **Import / retry same import** → Review → Continue. Send Claude the import reference.
4. Keep the page open until it reports the import complete and **Check status** shows `roster` and `roster-register` in mode **imported** with records above 0. Screenshot and send.
5. If it errors: screenshot (the page shows reason and step), then **Import / retry same import** to resume.

## 2. Parity check (Claude, 10 to 15 minutes)
Do nothing in Roster until Claude replies. Claude compares D1 with the frozen Google source and reports:
- source digest and record counts for `roster` and `roster-register`;
- collections: absences, assignments, entitlements, Stapler plans and archives, publication states, outbox, receipts, settings;
- spot checks for today to +14 days: absences, assignments, published notices.
**Continue only if Claude says "parity OK".**

## 3. Set the D1 switch in Cloudflare (10 minutes, before activation)
Safe now: it has no effect until step 4.
1. **Roster Pages project (gsps-roster)** → Settings → Variables and Secrets → Production → add `ROSTER_EDGE_AUTHORITY` = `d1` (type Text) → Save. Then apply it with a new deployment: Deployments → latest production deployment → **⋯ → Retry deployment**; if that option is missing, Create deployment → upload the v0.9.9e `3_Roster_Frontend.zip` again → Production.
2. **Worker gsis-roster-notifications** → Settings → Variables and Secrets → add `ROSTER_EDGE_AUTHORITY` = `d1` → Deploy.
3. **Worker gsis-operations** → same.
4. Roster still works on Google: open Assign Relief once to confirm. Tell Claude "step 3 done".

## 4. Activate (2 minutes)
1. edge-setup → section 3 → tick the box → **Activate verified owner** → Review → Continue.
2. Expect: active, legacy writes disabled. **Check status**: `roster` and `roster-register` mode **active**. Screenshot and send.
3. If it refuses ("fence unverified", "source mismatch"): stop. Google stays the record. Send the screenshot.

## 5. Test window (30 to 45 minutes)
Use a **future date** with no real reliefs (for example next Friday) and your own name.
1. Roster: Ctrl + Shift + R. Open Assign Relief, Daily Notify, System Config, Storage. All load in a few seconds.
2. Report Absence for yourself on that date, two periods, "Relief required".
3. Assign Relief on that date: auto-allocate; then change one cell by hand; Save.
4. Do **not** press "Let teachers see" or send WhatsApp (avoid messaging colleagues).
5. edge-setup → **Update backup**, then **Check status**: Google backup reaches the latest revision, 0 minutes behind.
6. Delete the test absence; Save. Backup again reaches 0 behind.
7. Tell Claude the times. Claude checks D1 heads, revisions, job health and that Google's backup matches.

**Pass = all of:** pages load; saves succeed; backup catches up within 2 minutes after each save; Claude reports no new job failures.

## 6a. If the test passes: stay on D1
- Leave everything as is. Tell Claude "staying on D1".
- Monday 06:30 to 08:00: be reachable. Claude watches job health from your first "check log".
- Switch back (6b) if, and not cleared within 10 minutes: Assign Relief will not open or save; absence reports fail; backup more than 10 minutes behind; WhatsApp not sent by 07:00.

## 6b. Switch back to Google (any time, 10 to 15 minutes)
1. edge-setup → **Switch back to Google…** → Review → Continue. Wait for "Verified Google backup restored". If it says "in progress", **Check status**, then press the same switch-back again.
2. Cloudflare: set `ROSTER_EDGE_AUTHORITY` = `legacy` in the Roster Pages project (then Retry deployment) and in both Workers (Deploy).
3. Roster: Ctrl + Shift + R; make and undo one test edit. It saves to Google.
4. Tell Claude. Claude checks the restored Google file and job health.

## Never
- Never delete or edit the Apps Script property `ROSTER_EDGE_AUTHORITY` by hand. Use activation and switch-back.
- Never start a second import while one is retained; resume it or Restart it.
- Never press "Let teachers see", WhatsApp or "Archive now" during the test window.
- Never activate during school hours, or without Claude's "parity OK".
