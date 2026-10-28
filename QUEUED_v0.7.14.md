# GSiS queued changes after v0.7.13

Baseline: GSiS_v0.7.13_Deployment.zip.
Baseline source: libfile_ed8f5cf0de188191a20e913b6a314b26.
Established: 19 October 2026, Singapore time.

## Working rule

Log all change requests unless the user explicitly instructs implementation, commit or build. The user authorised “commit next version” on 19 October 2026. Items 001 to 005 are included in v0.7.14, based on the full v0.7.13 package. No live deployment is authorised by this release action.

## 001: Roster > Assign relief > Excel exports

Status: Implemented in v0.7.14. Local verification and release evidence are recorded in VALIDATION.md.

1. Change the existing Export Excel action to export a full summary of all teachers, using the offline Stapler Module 3 (Relief) format and style.
2. Include all teachers, including those with no relief assignment; do not restrict this summary to relief arrangements.
3. Preserve the current relief arrangements export as a separate button labelled exactly "Export relief excel".
4. Place both export buttons in the same existing export area on Assign relief.
5. Use the supplied Stapler_v4_3(3).html and Stapler_v4_3_Reference(3).md as the Module 3 reference. Its teacher workbook uses four rows per teacher: Subject, Class, Venue, Group. Preserve the reference layout, ordering, and formatting when implementing the full summary.

Acceptance: Export Excel produces the complete teacher summary in the reference format; Export relief excel retains the existing relief arrangements output.

## 002: Roster > Name Bridge > Combined search and selector

Status: Implemented in v0.7.14. Local verification and release evidence are recorded in VALIDATION.md.

1. Combine the timetable name search field and selector into one searchable dropdown.
2. Typing in the same field filters the available baseline timetable names; selecting a result sets the mapping.
3. Retain validation against baseline timetable names. Search text alone must not save an arbitrary name.

Acceptance: A user can search and select a valid timetable name in one field without a separate search box.

## 003: Automatic allocator > Teaching match and coverage priority

Status: Implemented in v0.7.14. Local verification and release evidence are recorded in VALIDATION.md.

1. Prefer an eligible relief teacher who teaches the same subject as the lesson requiring cover.
2. Next prefer an eligible relief teacher who teaches the same level as that lesson.
3. Treat these as preferences, not requirements that exclude otherwise eligible teachers. Their position relative to existing fairness preferences must be resolved when implementing; the requested relative order is subject before level.
4. Make maximum lesson coverage the overall, non user editable objective. Search alternative combinations and reassign tentative choices across lessons instead of locking in greedy first choices.
5. Relax subject and level preferences where needed to achieve full coverage when feasible. Retain existing hard eligibility constraints, availability, protected assignments, and explicit override requirements. Full coverage cannot be promised when no feasible allocation exists.
6. Interpret "permutate fuzzily" as exploring alternative eligible combinations and accepting weaker preference matches for better coverage; it does not authorise bypassing hard constraints or require random or exhaustive search.
7. Score each candidate allocation as a whole against the configured business rules. Among arrangements with equal maximum coverage, use the arrangement with the least deviation from those rules, respecting their configured priority order. Do not select an arbitrary full coverage permutation or merely optimise each lesson independently.
8. Keep hard constraints outside the deviation score: a better score cannot make an ineligible arrangement valid. The fixed objective order is eligibility, maximum coverage, then minimum business rule deviation. No numeric weights are agreed in this log.

Acceptance: Subject matches rank before level matches among otherwise comparable options. The allocator chooses a feasible full coverage arrangement over a partial arrangement with stronger teaching matches. Among equally covered alternatives, it selects the lowest deviation score according to business rule priorities. If full coverage is infeasible, it maximises coverage and exposes remaining uncovered lessons.

## 004: Roster > Stapler > Import Offline JSON

Status: Implemented in v0.7.14. Local verification and release evidence are recorded in VALIDATION.md.

1. Rename "Load legacy plan" to exactly "Import Offline JSON" in the existing toolbar. Update related import messages to use the same terminology.
2. Accept the supplied offline Stapler state formats, including v3.9 and v4.3 files marked stateType "plan". Also retain support for "relief". Offline Stapler uses the same complete state builder for both; the label is save intent, not a restriction on contents.
3. Match teachers by name, with safe name normalisation and saved Name Bridge mappings where necessary. Resolve current owners, source teachers, added teachers, suspension targets and any relief assignees to the correct GSiS staff identity. Do not depend on offline tile IDs matching GSiS IDs.
4. Present missing or ambiguous identities for explicit resolution; never guess similar names or silently omit them. The samples contain both "Oliver" and "Olivia". Do not assume they are the same person. Retain Admin control of saved name mappings and validation of imported names against the supplied source.
5. Interpret the embedded workbook, selected date, weekday, week sheet and period timings. Import only the selected day's plan even though the files hold tiles for both whole timetable weeks. Compare source lessons with the active GSiS baseline and report real discrepancies for resolution; do not overwrite the baseline merely to force acceptance.
6. Preserve current and original lesson details, moved lessons, newly created exam and operational duties, custom classes, class and teacher suspensions, and Card Pit placement. Both offline "teacher" and "class" locations are placed cards; "pit" is unplaced. Import or explicitly resolve custom class and venue values instead of dropping cards.
7. Preserve the recess arrangements in the RECESS exemplar. Its selected day contains 36 teacher-assigned "RECESS" cards, comprising 26 new cards and 10 edited original cards, plus seven "Duty (Recess)" cards. Preserve each current teacher assignment; do not convert these into unstaffed recess cards. Reconcile them with dated GSiS recess cards so an import neither duplicates recess nor silently replaces the saved plan with default recess timings.
8. Decode legacy source metadata from the embedded workbook when absent, following the offline loader's compatibility behaviour. Keep original lesson anchors separate from modified card fields.
9. Load into the existing draft and review/save workflow. Parsing or mapping failures must not partially replace the draft. Imported settings must not silently overwrite GSiS allocation policy, identities, publication state or notification state.
10. Use all five supplied files as required acceptance fixtures at the authorised build. Preserve Relief content when present; these five samples all have empty reliefAbsences, so they do not prove Relief assignment or Swap compatibility.

### Evidence inspected on 19 October 2026

All five JSON files parse successfully. Their stateType is "plan". A read-only call to the unchanged v0.7.13 importer with valid matching-date probe plans reproduced the same immediate rejection for every file: "Save the legacy Relief state and import that file." This proves the format gate fails; it is not an end-to-end check against the live baseline.

The current importer matches plan teacher names and timetable names, demands exact existing class/venue mappings, ignores the embedded workbook and customClasses/addedTeachers lists, and rejects Swap records. Compatibility needs more than a button rename or removing the stateType check.

| Required exemplar | Version | Date | Library identity |
| --- | --- | --- | --- |
| 2026 Oct 21 P5 Higher Mother Tongue Languages Paper 2 EYE - saved 2026 Oct 15 1126h.json | 4.3 | 2026-10-21 | libfile_74e889b1cf688191b0b6d6a01da9888b |
| 2026 Oct 22 EL EYE PP2_LC - saved 2026 Sep 28 1327h.json | 3.9 | 2026-10-22 | libfile_2d98b687b9ac81918d29061d01095b90 |
| 2026 Oct 22 EL EYE PP2_LC - saved 2026 Oct 16 2129h-RECESS.json | 4.3 | 2026-10-22 | libfile_3d583c3de0248191bd0b515a8b33aeb6 |
| 2026 Oct 23 Sci EYE - saved 2026 Oct 15 0828h.json | 4.3 | 2026-10-23 | libfile_053c3bc7005c8191bfdc935812d42bf5 |
| 2026 Oct 26 (older version) - saved 2026 Oct 18 1655h.json | 4.3 | 2026-10-26 | libfile_adfa8a7997608191b03a3fa1d2e00bf3 |

Reference files: Stapler_v4_3(3).html, libfile_9473c54d4ad88191ae093e44669d082a; Stapler_v4_3_Reference(3).md, libfile_b2d43abe8d08819187107f4fc72246a8. The Oct 26 filename says "older version", but the payload declares version 4.3.

Acceptance: Each exemplar imports into its corresponding dated draft after any necessary explicit identity/baseline resolution. Its placed cards, Card Pit, custom classes, suspensions and recess content match the offline plan. No silent data loss, no automatic publication and no identity guesses.

## 005: Layout > 3D Campus > Courtyard rail and rain shelter

Status: Implemented in v0.7.14. Local verification and release evidence are recorded in VALIDATION.md.

Reference: image(20261019-000305).png, libfile_3c8964b7d65c81918226843ca9161f16. Screenshot inspected. Use its annotations to identify the exact geometry; the selected Hall label alone does not establish the affected structure's block or level.

1. Remove the short transverse rail marked with the orange cross between the blue and yellow highlighted portions on the right side of the courtyard view.
2. Change the blue highlighted portion to a rain shelter that continues the yellow highlighted shelter. Match the adjacent shelter's roof form and alignment.
3. Scope the change to the marked rail and blue portion; use the yellow portion as the design reference.

Acceptance: From the screenshot's viewpoint, the crossed rail is absent and the blue portion visibly continues the yellow rain shelter.

## v0.7.14 implementation decisions

The saved allocator order survives frontend and backend updates when the same operational data store is retained. Existing four-rule orders gain subject matching followed by level matching at the end; Admin can reorder the business preferences. Eligibility, maximum coverage and whole-plan score comparison remain fixed. Bounded searches distinguish proved optimality from the best result found.

All five supplied examples passed parsing, source comparison, import and backend draft saving against baselines reconstructed from their embedded workbooks. A different live baseline still requires a matching source or an explicit correction. Imported swaps and incomplete/no-relief absence records are rejected with an explanation rather than silently omitted.

The changed rain shelter is Block B L2: x854 to 1056, z617 to 644. The marked transverse rail at x927 was removed. Adjacent Block A geometry remains intact.
