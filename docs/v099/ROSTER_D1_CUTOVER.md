# Roster: making D1 the record (runbook)

Owner: Song Wee. Checks: Claude. Draft 30 Oct 2026; finalise after `roster-d1-google-backup` merges (names of the release action and the backup panel may change).

Google stays the record until step 4. Every step before that can be repeated safely.

## 0. Before you start
- [ ] `main` deployed, including the chunked import (PR #8) and the D1-to-Google backup (`roster-d1-google-backup`).
- [ ] D1 job health shows no new failures since the deploy (Claude checks).
- [ ] Roster quiet: evening or weekend, nobody allocating.
- [ ] You can be at a laptop at 06:00 the next school morning after step 4.

## 1. Import (evening, about 10 minutes)
1. Open `roster.gsps.edu.sg/edge-setup` → Roster migration → **Import** with a new request ID.
2. The first step locks Roster briefly while it captures Google. Then it copies in pieces; leave the page open until it says **imported**.
3. If it stops, press Import again with the **same** request ID: it resumes. Never start a second import.

## 2. Parity check (Claude, about 10 minutes)
Claude compares D1 with Google and reports:
- record counts per collection, and the source digest, for `roster` and `roster-register`;
- for each date from today to +30 days: absences, assignments (staff, period, status), published notices, outbox items;
- timetable baselines and Stapler plans present in both.
**Go on only if Claude reports equal.** If not, Restart the import (Admin) and repeat step 1.

## 3. Trial switch (evening, about 20 minutes)
1. edge-setup → **Activate** with the verified source digest. Google's Roster files stop accepting writes.
2. In Roster, make three test edits on a future date (an absence, a relief assignment, a Stapler note).
3. Watch **Google backup** in edge-setup until it shows **0 minutes behind** and the same revision as D1.
4. Open `Roster operations.json` modified time in Drive: it should be minutes old.
5. edge-setup → **Switch back (release)**. Wait for: paused, caught up, digests equal, fence cleared.
6. Cloudflare Pages (Roster) → Settings → Variables → `ROSTER_EDGE_AUTHORITY` = `legacy` → redeploy.
7. In Roster, undo the three test edits. They save to Google: legacy works again.
8. Tell Claude the times of each step. Claude checks job health and the test edits in Google.

## 4. Real switch (evening before a school day)
1. Repeat step 3.1 (Activate).
2. Cloudflare Pages (Roster) → `ROSTER_EDGE_AUTHORITY` = `d1` → redeploy.
3. Make one harmless test edit and watch Google backup reach 0 minutes behind.
4. Tell Claude. Claude checks D1 heads are `active` and the backup lag is 0.

## 5. First morning (05:30 to 08:00)
Watch, in this order:
- 05:30 auto-allocation ran once (Assign Relief shows the draft).
- Assign Relief opens in a few seconds; overrides save at once.
- Google backup lag stays under 2 minutes.
- "Let teachers see" and WhatsApp go out; delivery shows in Roster.
- D1 job health: no new failures (Claude, from 07:00).

## 6. Switch back: when and how
Switch back if any of these happen and do not clear within 10 minutes:
- Assign Relief will not open or save;
- WhatsApp not sent by 07:00;
- Google backup more than 10 minutes behind.
Steps: edge-setup → **Switch back (release)** → wait until it completes → Pages `ROSTER_EDGE_AUTHORITY` = `legacy` → redeploy. Then tell Claude.

## Never
- Never delete the Apps Script property `ROSTER_EDGE_AUTHORITY` by hand while D1 is ahead of Google: changes made in D1 would be lost. Use **release**, which waits for Google to catch up.
- Never run a second import while one is retained; resume or Restart it.
- Never switch during school hours.
