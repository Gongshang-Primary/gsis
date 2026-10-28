# Performance and reliability v0.6.07

Ponytail review reuses the existing converter, workbook generator, timetable renderer, model validator, gateway, Contacts authority and Drive store. Three native SVG icons add no dependency. No new project, table, trigger, migration or background write is introduced.

The selected timetable is parsed once. Preview stays local. The workbook is generated once for a pending save, and retry reuses the original payload and request ID. Mutation controls stay disabled while a save is unconfirmed. A successful save is recorded before refreshing the list, preventing accidental resubmission after a read failure. Existing receipt/revision checks and the final register commit remain the storage visibility boundary.

TG demand is a pure derived calculation. Removing the obsolete classification avoids user edits and backend writes for 147 existing groups in the saved deployment fixture. That fixture now produces 3,608.5 planned weekly man-periods, 82 eligible full-time teachers and D = 44.00609756097561, with no demand or other workload issues. These are fixture results, not a new read or modification of live deployment data.

Roster timetable and Calendar date reads retain their parallel execution and existing timeout. Failure diagnostics add one bounded log record at the failing boundary and expose only its reference. No retry loop or new cache hides current authority or activation changes.

pstack checks exercise actual parser/UI handlers, workbook contents, signed gateway boundaries, storage failure and receipt behavior, independent TG arithmetic, and generated garden meshes. Synthetic service checks establish behavior, not production latency or Google permissions. Full validation results and browser limitations are in VALIDATION.md.
