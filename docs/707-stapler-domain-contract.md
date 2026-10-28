# Stapler domain contract, v0.7.07

`shared/roster-stapler.js` exposes `GSISRosterStapler` in browser/Apps Script and CommonJS. It does no I/O, authorisation, publication persistence, notification sending or global teacher creation. The backend owns those boundaries.

## State and operations

`create(day, {date, endOfDayMinutes, subjectCategories, venues})` takes the existing Roster day context (verified date, saved model ID, periods, teachers with four-field cells, form classes). A plan contains `schema:1`, `date`, `baselineId`, `parity`, `venues`, `status:'draft'`, `revision`, `periods`, `teachers`, `classes`, `baseline`, `tiles`, `mats`, `recessDefaults`, `subjectCategories`, `warnings`. The baseline preserves original lesson cards, identities, time axis and workload categories. Existing plans must retain their original exact-date baseline.

A tile has `id`, `kind:'lesson'|'recess'`, `teacherId` (null for recess), `classIds`, `period` (null in Pit), `location:'grid'|'pit'`, `subject`, `venue`, `group`, `baselineId`, immutable `source`. `source` retains original teacher, class IDs, period and all three text fields. Recess also has `durationMinutes`; `tilePeriods(plan,tile)` returns every covered period. Teacher/Class POVs project these same objects; they must never create duplicate model cards.

`apply(plan, command)` returns a cloned valid draft with one increased local revision, or throws an error with `status` 400/409. The original remains untouched even when an accordion's later step clashes. Supported commands:

| type | Fields |
| --- | --- |
| move | tileId, period, optional teacherId or classId |
| pit | tileId |
| edit | tileId, patch: subject/venue/group/teacherId/classIds |
| suspend | target: teacher/class, targetId, fromPeriod, toPeriod, reason |
| removeMat | matId |
| addTeacher | teacher: staffId/name/timetableName |
| addClass | class: id/name, optional level/traditional/venue |
| addTile | tile: teacherId/classIds/subject/venue/group, optional period |
| bulkEdit | classId, patch: subject/venue/group, optional periods |
| recessMove | tileId, period |
| resetRecesses | none |

`validate(plan,{publish,baseline,previous})` checks identity, immutable anchors, timing overlaps, teacher clashes and class/recess clashes. `baseline` is the authoritative seed/plan or its baseline object. `previous` is the latest authoritative draft/published plan and freezes origins of added cards too. Passing only client data is not a server trust boundary. New added cards cannot arrive at first save already assigned to a different source teacher; save them first or use server-side command replay. Backend must verify added staff against Contacts and new records against its existing creation flow.

`publish:true` requires every traditional class to have actual lesson/recess coverage continuously from 07:30 to the uploaded baseline’s end-of-day time (13:30 by default). Pit cards, ghosts and mats provide no coverage or availability. Different teachers may co-teach a class. A single teacher may not have overlapping live cards even when period numbers differ. Draft views must display model warnings and preserve server-side authoritative validation.

## Projections and accounting

`effectiveDay(plan,day)` preserves existing teacher metadata and replaces cells with live lesson cards; it adds `staplerRecesses` and `staplerRevision`. Call it only with the chosen published plan for operational reads. Draft status is not an automatic publication decision.

`changes(plan)` returns `{staffId,period,before,after}` using the four-field cell format. `ghosts(plan)` returns moved/edited original cards. `tileState(plan,tile)` returns `original`, `edited`, `transfer` or `recess`; a transfer has priority over edited styling. Returning a tile exactly to baseline removes its ghost.

`accounting(plan)` returns per-teacher `ordinaryBaseline`, `ordinaryCurrent`, `teachingDelta`, `nonTeachingDelta`, `teachingDemandDelta`, `unknownActivities`, `reliefPeriods`, `reliefCount`, `transfers`. Transfers contain stable `tileId`, period, sourceTeacherId and lesson fields. Orange transfers are excluded from revised ordinary teaching and charged once as relief. School-wide teaching demand includes transferred lessons, so transferring a lesson does not reduce total demand. Backend recomputes the full weekly formula and owns ledger deduplication/replacement by tile/date. Unknown activities must make adjusted capacity unverified rather than guessed.

## Recess and migration choices

Recess timing comes only from the uploaded baseline `day.recesses`. Entries use the existing level/period contract; explicit `None` or an empty list creates no purple card for that level. Exact start/end timing is also supported for a card spanning short slots. No second Recess Regression timing setting is introduced. Initial configured recess overlaps move original lessons into Pit with visible warnings, preserving baseline. Reset evicts occupants to Pit; it does not restore former recess gaps. Accordion shifts adjacent lessons and validates each complete proposed step. A shared multi-class lesson moves once; if this clashes elsewhere, the entire gesture fails. Plain Recess/Break markers and Blocks are excluded from ordinary workload; named recess duty remains a real activity subject to its workload category. Baseline `endOfDayMinutes` controls publication coverage and is immutable within the saved plan.

`importLegacy(plan,payload)` supports saved Stapler/Staple Relief states with a matching selected date, weekday, exact time axis and odd/even parity, unambiguous teacher/class names and authoritative venue names. It verifies original lesson fields against the GSiS baseline, imports Plan placement, then applies Relief transfers. Legacy Swap records are rejected for review. Unknown identities and incompatible baseline fields fail without changing the draft. Configured recess conflicts enter Pit with a warning. It never imports workbook bytes, authority, publication state or send intent. Existing published state remains the backend's separate envelope.

Run `node tests/stapler707-model.cjs` for the focused domain checks. Local Node benchmark: 120 teachers × 24 periods, 1,440 live tiles / 873,847 bytes: 100 moves averaged 24.92 ms. Dense 2,880 tiles / 1,709,527 bytes: 100 edits averaged 40.87 ms. These are model-only local measurements, not browser or production service timings.
