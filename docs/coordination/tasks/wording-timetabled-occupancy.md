# wording-timetabled-occupancy: "individual (timetabled) workload" → "individual (timetabled) occupancy" (changelog)

- Status: claimed by Codex; after relief-count and R% PRs; merge held by owner
- Owner/model: Codex
- Branch: codex/wording-timetabled-occupancy
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 1 Nov 2026 21:07
- Base: c1b33acdd0d55755d1e035328c678e999d0ed8da; claim follows draft PRs #46 and #47
- Scope: public/workload-ui.js, public/relief-ui.js, generated public/app.js, roster-update/public/roster-calculations.js and relief-health copy, related string assertions; visible wording only.
- Acceptance: confirmed mapping in rendered copy, help, tooltips, accessible labels and Excel headers; preserve Workload settings/cap policies and all identifiers/data keys/API names; npm run build and full Node/LORD CI.
- Coordination: refreshed main includes Claude's separate displayed Stapler typo correction c1b33ac; no overlap. Owner explicitly authorised these three separate held draft PRs in order; no merge/deployment.
- Lanes: D (Deploy) and R (Roster); wording only; serial with lane R; after the D1 cutover

## Owner request (verbatim)
"across all viewports (mainly in deploy and roster) change individual (timetabled) workload to individual (timetabled) occupancy"

## Finding (Claude, main 9d6d08e+)
The exact phrase "individual (timetabled) workload" does not appear in any source file. The concept appears under other labels:
- Roster, My Calculations (`roster-update/public/roster-calculations.js`): "W<sub>i</sub> is your weekly workload estimate…", "Your weekly workload estimate, W<sub>i</sub>".
- Deploy (`public/workload-ui.js`, `public/app.js`): "Individual load is all actual deployed periods…", "Individual load status uses each teacher's own ±10% limits…", "UT: total actual workload", "Workload statistics by teacher category".
- Not the same concept (keep unless the owner says otherwise): the "Workload settings" tab and policy, weekly caps ("Weekly cap covers total actual workload"), "workload category" of a subject.

## Wording boundary (confirmed by owner mapping below)
Change only the per-teacher measure (Wi and "Individual load") to "individual (timetabled) occupancy". Keep policy/settings names. Visible text only: no identifiers, data fields, exports' column keys or API names change. Check Excel export headers and help text too.

## Owner screenshots (1 Nov ~21:10): highlighted text
Roster, Learn about Auto Allocation → My Calculations (`roster-update/public/roster-calculations.js`):
- "W<sub>i</sub> is your **weekly workload estimate**." and step 3 "Your **weekly workload estimate**, W<sub>i</sub>, is 83.85 periods."
- Step 1 "Start with your **recorded work**." and footer "This is a planning estimate based on your **recorded work**."
- Footer "Your **weekly quota** already includes the offload factor…" and "Displayed figures are rounded; the **quota** uses full precision."
Deploy, Stats tab (`public/workload-ui.js` / `public/app.js`):
- Title "**Workload** reference"; "**Actual load** includes FTT, teaching, PD…"; "**Individual load status** uses each teacher's own ±10% limits".

## Mapping (owner confirmed 1 Nov ~21:20)
| Now | New |
|---|---|
| weekly workload estimate (Wi) | weekly individual occupancy (timetabled plus allowances) — owner ruling 1 Nov ~21:20 |
| recorded work | recorded (timetabled) occupancy |
| Workload reference (Deploy Stats title) | Occupancy reference |
| Actual load | Actual (timetabled) occupancy |
| Individual load status | Individual (timetabled) occupancy status |
| weekly quota / quota (highlighted) | weekly relief quota, R / relief quota — owner ruling 1 Nov ~21:20 |

Visible text only, same rule as above. Also update any help text, tooltips and Excel headers that show the same terms, in Deploy and Roster (and Contacts/Layout if they show them).

## Backlog refresh claim, 6 November 2026

Codex resumes #48 under the owner's instruction to clear the backlog continuously. Reconstruct only the approved visible wording on main 69efd3ab9f0dbbb31f1a3bc7da9c86b3dc2ea348. Preserve configured target settings, current workload arithmetic, fresh-start/history handling and policy names. Rebuild generated frontend output. Claude reviews the new exact head; owner merges. No live operations.


## Backlog rebase (Model: Codex, 13 Nov)

Reviewer: Muse at the new exact PR head. Original `ee8cadbeda695f8161a6702592c99d3370f6fbf0` was consolidated with exact original tree `640519739699e724968b5958408a34ab73e00531` preserved before rebase onto fetched main `78f6a21`. The sole conflict was CHANGELOG.md; both entries were retained. Wording, data identifiers, budgets and formulas remain the PR's original scope.

Build leaves no diff; merge-tree is clean. All five affected UI/ledger/calculations programs and two Statistics/composition compatibility programs pass (seven total). Fresh exact-head CI will be recorded in PR #48; old approvals do not approve the new head. No full local-suite rerun, live provider/data action, deployment, main push or merge.
