# wording-timetabled-occupancy: "individual (timetabled) workload" → "individual (timetabled) occupancy" (changelog)

- Status: proposed (owner changelog, 1 Nov 2026 ~21:00); not authorised to build; scope needs owner confirmation
- Owner/model: unassigned (Codex when authorised)
- Reviewer/model: Claude
- Lanes: D (Deploy) and R (Roster); wording only; serial with lane R; after the D1 cutover

## Owner request (verbatim)
"across all viewports (mainly in deploy and roster) change individual (timetabled) workload to individual (timetabled) occupancy"

## Finding (Claude, main 9d6d08e+)
The exact phrase "individual (timetabled) workload" does not appear in any source file. The concept appears under other labels:
- Roster, My Calculations (`roster-update/public/roster-calculations.js`): "W<sub>i</sub> is your weekly workload estimate…", "Your weekly workload estimate, W<sub>i</sub>".
- Deploy (`public/workload-ui.js`, `public/app.js`): "Individual load is all actual deployed periods…", "Individual load status uses each teacher's own ±10% limits…", "UT: total actual workload", "Workload statistics by teacher category".
- Not the same concept (keep unless the owner says otherwise): the "Workload settings" tab and policy, weekly caps ("Weekly cap covers total actual workload"), "workload category" of a subject.

## Proposed rule (pending owner confirmation)
Change only the per-teacher measure (Wi and "Individual load") to "individual (timetabled) occupancy". Keep policy/settings names. Visible text only: no identifiers, data fields, exports' column keys or API names change. Check Excel export headers and help text too.

## Owner screenshots (1 Nov ~21:10): highlighted text
Roster, Learn about Auto Allocation → My Calculations (`roster-update/public/roster-calculations.js`):
- "W<sub>i</sub> is your **weekly workload estimate**." and step 3 "Your **weekly workload estimate**, W<sub>i</sub>, is 83.85 periods."
- Step 1 "Start with your **recorded work**." and footer "This is a planning estimate based on your **recorded work**."
- Footer "Your **weekly quota** already includes the offload factor…" and "Displayed figures are rounded; the **quota** uses full precision."
Deploy, Stats tab (`public/workload-ui.js` / `public/app.js`):
- Title "**Workload** reference"; "**Actual load** includes FTT, teaching, PD…"; "**Individual load status** uses each teacher's own ±10% limits".

## Proposed mapping (Claude; owner to confirm the quota lines)
| Now | New |
|---|---|
| weekly workload estimate (Wi) | weekly individual (timetabled) occupancy |
| recorded work | recorded (timetabled) occupancy |
| Workload reference (Deploy Stats title) | Occupancy reference |
| Actual load | Actual (timetabled) occupancy |
| Individual load status | Individual (timetabled) occupancy status |
| weekly quota / quota (highlighted) | **to confirm**: "weekly relief quota, R" / "relief quota"? |

Visible text only, same rule as above. Also update any help text, tooltips and Excel headers that show the same terms, in Deploy and Roster (and Contacts/Layout if they show them).
