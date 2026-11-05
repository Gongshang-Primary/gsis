# GSiS v0.9.9l deploy (main @ COMMIT.txt): 6 files

Goal: get Auto-allocate working on Google again.

New since v0.9.9j (live today):
- Auto-allocate keeps its preparation when only the clock minute moves; it redoes once only if a period starts, the date changes or a cutoff passes (#80). Replaces the hand-edited hotfix.
- Only changes that affect the planned date stop a preparation; unrelated writes merge (#80).
- Your Auto-allocate wins: the scheduled cycle skips while an SMC run owns that date (#80).
- System Health shows preparation time per run; after 45 s Auto-allocate suggests "Auto-fill blanks" (#80).
- Stapler plans keep their own copy of the day; baseline swaps or prunes never touch a Stapler day (#78).
- Days without a Stapler plan: a baseline change releases only lessons that no longer exist; large releases wait for SMC/Admin confirmation (#78).
- Also includes #68 (WhatsApp private links behind buttons), which was in v0.9.9k.

## Known risk: speed
v0.9.9k (same #68 code) made the Assign Relief load time out (30.8 s against a 30 s limit). l adds work. **The Assign Relief load may time out again.** If so, roll back at once (safe, see below) and tell Claude; the speed fix goes to Codex as top priority.

## Deploy (about 20 minutes), in this order
1. **Roster backend** (Apps Script "Roster GSiS"): paste `1_Roster_Backend.gs` into the main file, replacing everything, including your hand-edited hotfix (keep `EdgeAuthorityTools`) → Save → Deploy → Manage deployments → edit → New version → Deploy. **Note the old version number** (your rollback target).
2. **Deploy backend** (Apps Script "Deploy"): same with `2_Deploy_Backend.gs`.
3. **Roster frontend** (Cloudflare Pages gsps-roster): upload `3_Roster_Frontend.zip` → Production. `ROSTER_EDGE_AUTHORITY` stays **legacy**.
4. **gsis-roster-notifications** ← `4_gsis-roster-notifications_worker.js` → Deploy.
5. **gsis-operations** ← `5_gsis-operations_worker.js` → Deploy.
6. **Deploy frontend**: upload `6_Deploy_Frontend.zip` → Production.
- **Venues backend: no change**. It is identical to v0.9.9j. Do not redeploy.

## Check, in this order (stop at the first failure)
1. Roster header **v0.9.9l**. Deploy header v0.9.9l.
2. Assign Relief for **tomorrow** loads. Note the seconds.
   - Times out → **roll back now** (rule A below). Do not press Auto-allocate.
3. **First Auto-allocate on a date WITHOUT a Stapler plan** (for example Monday 9 Nov, if it has absences). Press once. Note "Allocation stopped" or the number of periods filled.
4. System Health → allocation run → preparation time. Send Claude: load seconds, preparation seconds, result.
5. Only then Auto-allocate on a **Stapler day** (for example tomorrow). From this moment rule B applies.
6. Reload Assign Relief twice. The filled count must not change.

## Rollback
- **Rule A, before any Auto-allocate or relief save on a Stapler day:** Apps Script Roster GSiS and Deploy → previous version; Pages and both Workers → previous deployment (v0.9.9j). Safe. Your hotfix returns with the old Roster version.
- **Rule B, after any Auto-allocate or relief save on a Stapler day:** **do not roll the Roster backend back to j.** l marks Stapler-day relief with the Stapler plan's own id; j's reconcile does not know it and would cancel every such relief on the next read (the 5 Nov D1 fault, now on Google). Fix forward with Claude instead. If you must roll back anyway: first export the relief for those days, expect them to be cancelled, and redo them by hand.

## After a good first morning (not before): Stapler migration, 3 minutes
Roster, signed in as Admin → System Health → "Review retained relief and Stapler day copies" → **Dry run: preview day copies** → check the dates and sources → confirm. Run the dry run again: it must show nothing left. On the same page, "Retained relief assignments" lists any blocked release: send Claude a screenshot before confirming one. Plans still work before migration (each plan carries its original day); the migration makes every stored plan self-contained.

## Not in this bundle
LORD (#77) is deployed separately. Calendar stays as before. `optional-label-only/` = frontends whose only change is the label. Not for the D1 cutover tonight: run l on Google for at least one normal school day first.
