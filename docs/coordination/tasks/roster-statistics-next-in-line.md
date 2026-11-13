# roster-statistics-next-in-line: "Cumulative percentage of relief done R%" table (changelog)

- Status: merged (#47 at 4b66444 as 49be897)
- Owner/model: Codex
- Branch: codex/roster-statistics-r-percent
- Depends on: roster-relief-count-investigation (same count definition; build after or together)
- Reviewer/model: Claude
- Lane: R (serial; held by owner)
- Last updated (Asia/Singapore): 1 Nov 2026 20:40
- Base: stacked on relief-count head 514a3411b46025db5e7e12046eb9c599336a8871; retarget to main after the count PR merges
- PR: not opened
- Out of scope: cutover, freeze, import, activation, live record/configuration changes and messages.
- Files/domains (expected): `roster-update/public/roster-statistics-ui.js` (third table after "Total Absences and Relief — by Date"), statistics data source, `shared/roster-allocation.js` (export its unchanged ordering key), tests.

## Owner request (verbatim)
"under roster > statistics > add as third diagram (first being "Total Absences and Relief — cumulative", 2nd being "Total Absences and Relief — by Date") rank table of teachers by cumulative R% done (i.e. the higher the name, the more like system will assign the teacher next available)"

## Intent
A table of teachers by cumulative R% done, ascending by default: least done at the top, most at the bottom.

## Design rules (Claude)
1. Use the allocator's own fairness key from `shared/roster-allocation.js`; never a second formula. Otherwise the table misleads.
2. Title (owner ruling 1 Nov ~20:15): **"Cumulative percentage of relief done R%"**. No "next in line" wording. Default sort: R% ascending (lowest first); columns stay sortable.
3. Exclude inactive staff (Contacts inactive, owner option 1B) and staff with no R entitlement.
4. Columns (proposed): Rank, Teacher, Relief done, R entitlement, R% done, Last relief date.
5. Must read from D1 when D1 is the record; add a D1-path test.

## Defaults until the owner rules otherwise (Claude, 1 Nov)
1. Period: the accounting year to date, the same window as My Calculations ("1 Jan to today").
2. Ties: fewest relief periods done, then name.

## Implementation and evidence (Model: Codex)
The third table has the exact owner title, defaults to the allocator's existing unrounded R% key ascending, then completed periods, name and staff ID. It excludes inactive, ineligible, daily-roster and zero accumulated-entitlement staff. Completed relief and last relief date cover 1 January to today, using `accounted` and `reliefCompleted`: elapsed published periods count automatically; draft/future work is not completed. No confirmation step was added.

The allocator's key already includes committed work and uses a weekly basis for long-term SRE. The table preserves those rules, displays Committed and Ranking basis columns, and explains them. It is a fairness reference, not an availability promise. `rankingUtilisation` is exported unchanged rather than copied. Other allocation rules and the activation fence are unchanged.

A separate Admin/SMC-only read projection serves current-year fairness from Google or authoritative D1 without writes, Calendar/timetable hydration, entitlement capture or the activity-range cache. Range filters affect the existing activity tables; the new table always remains accounting year to date, including its Excel metadata. Refresh reloads both. Sorting and filtering stay local. Missing SRE teaching proof and unverified history are disclosed.

## Verification / Review / Deployment
- `TZ=Asia/Singapore npm run build`: all 18 production components built; not deployed.
- New pure/Google route, real SQLite/D1 route and jsdom UI tests pass: published completion, reservations, SRE basis, inactive/no-quota exclusions, ties, year boundaries, permissions, read-only state, third position, local sorting/filtering and retained explanation.
- Existing Statistics projection test passes. Existing Chromium test updated for the eighth table/export and separate read endpoint. Chromium is unavailable locally; exact-head CI must verify it and the full Node/LORD suites before draft PR handoff.
- Reviewer: Claude at the final pushed head. Owner holds merge; no production changes.

## Related display fix (owner screenshot, 1 Nov ~20:30, v0.9.9g)
"Learn about Auto Allocation → My Calculations" reads "your relief quota R = 0 and your cumulative relief done is **Unavailable**". Cause: `roster-update/public/roster-calculations.js` shows `h.percentage`, which is done ÷ accumulated quota; with quota 0 it is not finite, so the text falls back to "Unavailable". The data is correct (completed 0 periods, quota 0); the wording is wrong.
Fix: when the accumulated quota is 0, show "0 periods done; no relief quota recorded, so no percentage" (or the done count) instead of "Unavailable". Use the same rule in the R% table (staff with no quota excluded or shown as "no quota"). Display only; no data change. Lane R, after the cutover.


## Refresh claim, 6 November 2026

Model: Codex. Refresh against current main through refreshed #46 at 4ccda08dd64ab337b7e662715ef371a396646098. Use current allocator balances and unchanged ranking key, including opening balances and current fresh-start coverage. Keep the projection read-only and Admin/SMC-only. No allocation policy changes. Build and full CI required; owner merges.

Current refresh: totals come from allocator balances, including confirmed opening balances and commitments. The date label follows My Calculations after fresh start; last relief date uses only retained records after the opening cutoff. Excel metadata uses the fairness basis, independent of the activity table mode. No allocator formula or sorting policy changes.

## Backlog stacked rebase (Model: Codex, 13 Nov)

Reviewer: Muse at the new exact PR head. Original child head `6b67088d99bd3c8aed12072452fe0f784929ef22` was rebased relative to its old #46 parent `c1b29487e61136ff55a1f578c51893ff733b0e2e` onto #46's new CI-green head `72f14067716b8fbba42bae0ca5fd00869f0f6c86`. Its GitHub base stays `codex/roster-relief-count`; do not retarget main until #46 merges. Only generated Worker bundles conflicted and were regenerated canonically.

The existing PR adds `statisticsRPercent`, so the current parity catalog now has 273 entries. Its D1 handler succeeds in the synthetic probe; all 272 previous outcomes remain identical. Ten local programs pass: four affected statistics programs, both parent relief-count programs, fresh-start accounting, statistics contrast and both parity checks. Build/repeat build and merge-tree against the new parent are clean. Fresh exact-head CI is recorded in PR #47; old approvals do not approve the rebased head. No new policy, live actions, merge or main push.
