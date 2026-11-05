# Claude review of PR #79 (D1 fresh start, route C) at exact head 7b17c86 (5 Nov)
(Kept outside the task file so the merge does not conflict.)

- Verdict: approve for merge (owner decides). CI full-suite green at 7b17c86 (run 41997548643: 997/997 Node, 40/40 LORD, browser checks). Claude locally at 7b17c86: all 14 new or changed test programs pass (Chromium path set); canonical build leaves no diff.
- Checked:
  - Fresh start: empty roster and register, no Stapler plans; the first timetable upload becomes active; new Stapler plans carry daySnapshot (#78).
  - Accounting: `openingBalance` applies only on a fresh-start state; fairness = opening quota/done + weekly entitlements and completed relief strictly after the as-of date (no double count); `initialiseFreshStartAccounting` marks the year unverified and **Auto-allocate is blocked until Admin confirms Opening balances**.
  - Prefill (`freshStartOpeningBalances`): proposal only; matched by teacher id; Admin-only; reads end the day before the fresh-start date.
  - Rollback: pauses D1, keeps D1 writes for re-entry, restores the original Google pointers; Google becomes writable again.
- Risks (not blockers):
  1. The prefill and the archive views (history, statistics, personal calculations) read the whole frozen Google operations file on each request, the same heavy read that timed out on v0.9.9l. The prefill may hit UPSTREAM_TIMEOUT. Fallback: paste from the fairness file the owner saves before the freeze. Teachers opening old history may see slow or failed loads; acceptable for a read-only archive.
  2. Cutover-night order matters: upload timetable → Opening balances confirm → absences → Auto-allocate. Allocation refuses until balances are confirmed.
  3. Only about 20 minutes of live D1 so far (attempt 4); the first D1 morning is the real test. Keep the rollback route ready.
