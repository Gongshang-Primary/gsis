# Codex build queue from 30 Oct 2026 (owner go: all logged items)

Priority update 30 Oct 2026: build roster-operations-split-files (row S) first, then roster-d1-google-backup (row D1), before other rows.

**31 Oct owner override: Follow-up R2 is the sole implementation priority.** PR #33 is merged as `eb2bcd4`. Pause #30, #29 and other ChatGPT work. Build `roster-d1-import-packed-capture.md` from current main as a separate PR. Full Node and LORD must pass before opening it. Claude reviews the exact head; owner merges. Do not restart the rehearsal import until R2 is merged and deployed.

Quiet hours 30 Oct 2026 night (owner: "get as much deployable done as possible"; no bundles until the owner asks).
- Merged tonight: #20 (2b2), #21 (collapsible TG exceptions), #22 (row 3 Excel), #23 (rows 5 and 6).
- Claude built: row V phase 1 (#24), row 15b SIUE by specialism (#25).
- **31 Oct 05:30 owner decision: option A first.** Codex next is **row A, roster-archive-cold-output.md** (archive machine output older than 30 days; keep all records). #19 is repurposed as the D1 backup format: do not enable split on live data.
- **1 Nov 08:05 owner: all open work to Codex** (order in LANES.md "Current assignments"): F, then #30, #29, P, then row C taken over from Gemini's #35.
- **1 Nov 04:05 TOP PRIORITY: row F** `roster-d1-cutover-freeze.md`: freeze Google writers before the cutover snapshot (activation refuses on any change; a real import takes over an hour). Before #30 and #29.
- **31 Oct 15:25 TOP PRIORITY: row R2** (capture serialises packed state; record failure reasons). Rehearsal 2 failed at capture (41 s). See the R2 section in roster-d1-import-resumable-prepare.md. Pause row D1 work only if R2 needs the same files; otherwise R2 first, then continue D1.
- **31 Oct 12:50 OWNER ORDER: D1 first ("switch to D1 asap").** Codex works only the D1 path until the switch, in this order:
  1. **Row R** `roster-d1-import-resumable-prepare.md` (import fits the Apps Script limit).
  2. **Row D1** `roster-d1-google-backup.md` (Google backup in split files plus switch-back; reuse #19's split read/write code as the backup format, do not enable split on live data).
  3. Then rows I (inactive teacher, owner 1B), C (Contacts filter), P (peer-mail), then the rest.
  Claude finishes the cutover runbook (`docs/v099/ROSTER_D1_CUTOVER.md`) alongside row D1. Archive age stays 30 days (owner: the number does not matter after D1).
- **31 Oct 12:35 TOP PRIORITY (owner):** row R, `roster-d1-import-resumable-prepare.md`: split D1 import preparation into steps under the Apps Script limit (rehearsal import failed 12:24). Build this before every other row.
- **31 Oct 10:10 owner priority:** next PR is **row I, inactive in Contacts = unavailable in Roster** (PENDING_CHANGELOG entry 31 Oct). Then row C, Contacts Edit Info TTb filter (small). Row A merged as PR #28 and deployed in v0.9.9c.
- **Codex next, in order:** (00) row R; (00b) row D1; (0) row I (owner 1B: remove the inactive teacher's not-yet-started duties and re-allocate); (0b) row C; (0c) row P, peer-mail health fix (owner go 31 Oct); (1) #19 review fixes (read cost, confirm dialog), for the D1 backup use; (2) row 2c FAJT levelling; (3) row V phase 2 (mismatch notice, Worker version, bundle letter refusal); (4) rows 10 to 14 in order.
- **31 Oct owner continuation:** Row R merged as PR #32 (`396546d`). Row D1 includes the two import follow-ups and folds in #19 split storage. After opening a green Row D1 PR, Codex continues #19 cleanup, #30, then #29 without waiting for Claude review; owner still merges. No deployment or authority change.
- Main checkout rule: run `npm run build` before `npm test` after every branch switch.

Owner order 30 Oct 2026 evening (owner away from PC; bundle 6bb4844 not yet deployed): open two PRs now.
1. Row S (split files): build and open the PR, but **do not ask for merge** until the owner has deployed bundle 6bb4844, set ROSTER_OPERATIONS_MAX_CHARS, and sent the Storage screenshot. Claude reviews meanwhile.
2. Row 2b2 (roster-sre-fajt-r-calc): build, review, merge as normal.
3. Row V (release-version-letter): small; merge before the next deploy bundle so it ships as v0.9.9b. May take the second PR slot after 2b2.
Then, as each merges: 2c, 15b, rows 4 to 6, then 7, 8, 8b. Row D1 waits for row S to merge. The deploy bundle is fixed files; merges to main do not change it.

Owner (Song Wee, 30 Oct): "it can be all, let codex work while i teach". Claude reviews every PR at its exact head; owner merges and deploys. Work top to bottom, at most two open PRs at a time. Each task file holds its own background.

| # | Task file | Notes |
|---|---|---|
| 1 | roster-relief-auto-complete.md | R% shows 0 for everyone today |
| 2 | (new) roster-assigned-by-label | PENDING_CHANGELOG "Assigned By shows the auto-allocator" |
| **V** | release-version-letter.md | Owner 30 Oct: one label v0.9.9b on every component, letter advances each deploy, mismatch notice. Before next bundle. |
| **S** | roster-operations-split-files.md | **Owner 30 Oct: first.** Removes the 16M cap on Google before D1. Own PR. Hold merge until bundle 6bb4844 is deployed and the Storage screenshot is in. |
| **D1** | roster-d1-google-backup.md | **Owner priority 30 Oct: D1 as Roster record.** Next after the SRE work already in progress. Claude writes roster-d1-cutover-runbook.md in parallel. |
| 2b | roster-sre-daily-priority.md | PR #14: daily SRE priority; approved Ad hoc relief max periods setting (initial 10), existing consecutive limit, no R%. Latest task decisions supersede the earlier no-new-setting note. |
| 2b2 | roster-sre-fajt-r-calc.md | SRE with a Deploy timetable uses the FAJT R calculation |
| 2c | roster-fajt-levelling.md | After SRE: FAJT first until FAJT average R% leads school average by a Settings margin (default 20 points) |
| 3 | roster-excel-relief-for-absent.md | Report Absence → Export Excel |
| 4 | (new) roster-reminder-cheap-check | Skip the full operations read on published days until the next reminder is due (Claude note 2 on PR #7) |
| 5 | (new) roster-delivery-time-format | PENDING_CHANGELOG "delivery time shows a raw number". **Claimed by Claude 30 Oct (owner: work through changelog).** |
| 6 | (new) roster-published-time-chip | PENDING_CHANGELOG, time only, no publisher. **Claimed by Claude 30 Oct.** |
| 7 | lord-queued-writes.md phase 1 | Queue and status list, no UI change |
| 8 | lord-queued-writes.md phase 2 | Book cart, open/collect, collect photos, return, return photos |
| 8b | deploy-queued-writes.md | Same queue as LORD; keep clash detection and who-did-what notices |
| 9 | calendar-099a-save-flow.md | Instant save, weekly view, year overlay, venue chips (max 6) |
| 10 | (new) roster-stapler-all-dates | Owner decisions 1 and 2 under Annual R% in PENDING_CHANGELOG |
| 11 | (new) roster-peer-release-notify | Owner decision 3 |
| 12 | (new) roster-my-relief-r-percent | Owner decision 4 |
| 13 | (new) roster-suspended-baseline-view | PENDING_CHANGELOG |
| 14 | (new) roster-relief-on-timetable | Relief overlay on the teacher's day timetable |
| 15 | (new) deploy-specialist-count-fajt | PENDING_CHANGELOG owner decision |
| 15b | deploy-siue-by-specialism.md | Relief Settings: SIUE general plus PE, Art, Music overrides; logic from owner's sensitivity study |
| 17 | lord-queued-writes.md phase 3 | OVERLORD/STARLORD after a week of phase 2 without double bookings |
| 99 | d1-first-new-modules.md | Design rule, lowest priority (owner 31 Oct). Apply when designing new modules; no code now. |

Rules: create the task file for a "(new)" row before claiming; keep Google authoritative; no ROSTER_EDGE_AUTHORITY change; regenerate bundles; run the full suite before asking for merge.

Test baseline from 30 Oct 2026 (PR #15): `npm test` is fully green (875/875, LORD 38/38) when run in the main checkout with TZ=Asia/Singapore and ROSTER_TEST_CHROMIUM set. Any failure is now real. Runs in a git worktree lack ignored release zips and fail three packaging tests; do not treat those as baseline.
