# GSiS v0.4.02

Prepared from the saved v0.4.01 source and the approved Q23–Q38 queue. No live installation was performed.

| Queue | Delivered change |
| --- | --- |
| Q23 | Readable headers, links, controls, warning fills and muted text across the suite. |
| Q24–Q26 | ISH west L1 doorway; interior-facing WC/Store doors at L1/L4; covered two-flight L1-to-L4 east stair with intermediate platform and vertical guards. |
| Q27–Q28 | Full-cell n/a shading; closing, focus and centring after in-cell selection; independent panel scroll retention. |
| Q29–Q30 | Stable field storage, compact save acknowledgements, same-ID receipt recovery, journaled dirty writes, edit indexes excluding audit history, revision deltas, fresh full loads, targeted Contacts writes and catalogue recovery, public-campus change responses, migration/rollback helpers and endpoint inventory. |
| Q31 | Duty entry/print structure based on the supplied duty-deploy workbook; one-page default A4 landscape PDF and continuing custom content. |
| Q32 | Version-owned Fortnight Split with KP editing, audit, independent weekly/fortnight blocks, calculated targets and mismatch warnings. |
| Q33 | Read-only Duty Cards with duty frequencies and alphabetical teacher totals. |
| Q34 | Versions before Audit, per-version Notes, accessible header selector. |
| Q35–Q37 | 17 PLTs, 32 Events and 12 additional committees, preserving existing definitions and assignments. |
| Q38 | Published deployment filters with checkbox OR/AND matching and same-assignment Level/Subject semantics. |

Implementation choices for previously open details: splits use direct level/subject rows, whole lesson-block counts and warning-only mismatches; computed FT remains a selectable subject because only four headers were explicitly excluded. PLT introduces no additional publication gate. Existing Duty descriptions and all spreadsheet teacher allocations are left under the user's control.

See DEPLOYMENT.md for installation, migration and rollback. Live timing and production cutover remain unverified.
