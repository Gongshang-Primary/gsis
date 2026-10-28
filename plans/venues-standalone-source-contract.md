# Venues standalone source contract

Recon against `f1069a1`. User authorised full v0.9.2 and a standalone Venues Apps Script. This is an implementation handoff, not a claim of implemented behaviour.

## Ownership and coordination

Venues owns its reservation spreadsheet, permissions, source activation pointer and durable outbox. Roster remains the only writer of the baseline register and operational timetable. A signed begin/end protocol coordinates effective source changes; the two projects' ScriptLocks are not globally atomic.

Canonical hook sites:

* `backend/Roster.gs::rosterCommit_` (line 199): baseline upload, metadata, activation, pruning and restoration all end here. Call begin after preparing and validating the final register, before its Drive commit. Complete after acknowledged commit. Failed/ambiguous Drive result retains pending.
* `backend/RosterOperations.gs::rosterOperationsCommit_` (line 41): all operations writes end here. Compute the effective occupancy source fingerprint and call begin only when it changes; harmless receipt, audit and notification status updates must not invalidate occupancy. Complete after the final authoritative document commit.
* Existing `backend/RosterTimetableBatch.gs::rosterTimetableBatchCommitBegin_` is a model for a pending/ready write protocol, not a sufficient Venues fence: it misses baseline register changes and its read path may return a 31-day window marker.

Roster owns its writer lock while calling signed `beginSourceChange({requestId,previousSourceKey,targetSourceKey})`. Venues acquires its own lock, durably marks pending, releases it and replies. Only then may Roster mutate the source. End marks the target source stale/dirty, never ready. Venues source preparation may call Roster only outside the Venues lock, so there is no reverse lock dependency.

Snapshot activation under the Venues lock compares ticket, Roster source key, Calendar key and venue key. A stale completion cannot clear a newer pending ticket. A lost acknowledgement leaves pending until explicit Roster recovery under its lock verifies the actual current generation. Do not automatically expire pending tickets. When Venues is enabled, failed begin must stop the source mutation; otherwise the concurrency guarantee is false.

A ready generation remains readable when stale, but cannot admit new reservations. Existing pending/confirmed reservations continue to hold their intervals until reconciliation proves their state. Reconciliation changes occurrence, audit, outbox and cursor in one revision-checked Advanced Sheets batch.

## Export shape and field mapping

The exporter is a service-only, privacy-whitelisted projection. Never return raw Roster model, Contacts records, plan titles, teacher names, notes or absence reasons to the browser.

Suggested wire shape:

```js
{
  schema: 1,
  sourceKey: 'sha256',
  observedAt: 'server ISO',
  bounds: {from: 'YYYY-MM-DD', to: 'YYYY-MM-DD'},
  dates: [{date, covered: true, periodKey, patternKey, exceptionKey: null}],
  periods: {key: [{period, startMinutes, endMinutes}]},
  patterns: {key: [{venueAlias, weekday, period, source: 'baseline'}]},
  exceptions: {key: [{venueAlias, period, source: 'suspended'|'published'}]},
  unavailable: [{date, code}]
}
```

Venue IDs are resolved by Venues' authoritative alias register before activation. Use canonical JSON/content hashes. A covered empty date and an uncovered date are different states. Missing or ambiguous aliases invalidate the affected date/resource; they do not remove the source occupation.

### Baseline

`GSISRoster.active(index.entries,date)` is the authoritative selection rule. The index entry provides `id`, `modelFile`, `from`, `to`, `priority`, `pruned`. `rosterModel_(entry)` loads an immutable model.

Model layout is `single-week` or `odd-even`; the selected week is `model.single` or `model[calendar.parity]`. Each week has `perDay` and `blocks`; each block has `name` and `cells`, with each cell exactly `[subject,className,venue,groupName]`. Weekday offset is Monday=0; select `cells.slice(weekday*perDay,(weekday+1)*perDay)`. Include every model block even when its teacher has no Contacts match. Deduplicate shared occupation by venue/date/period and source.

`rosterTimetableBatchPeriods_(model)` derives period numbers and minute boundaries from `model.timing`. Never manufacture a new period grid independent of that source.

Calendar `schoolDay:false` proves a covered holiday/weekend when its released year is available; `schoolDay:null` or unavailable year is missing coverage, not free space. The year-level source snapshot should canonicalise and hash the actual returned school-day/parity facts, excluding volatile checkedAt values.

### Confirmed suspended plans

Use `GSISRosterOperations.confirmedStaplerSnapshot(record,state.audit)`, not `readyStaplerPlan` or `composeStaplerContext`. The latter planning paths can use a newer draft after confirmation. The returned object is `{plan,revision,at,by}`; the plan must match active baseline ID, date and period grid.

`GSISRosterStapler.effectiveDay(plan,baseDay)` produces teacher cells from the exact plan. Alternatively project `plan.tiles` where `kind==='lesson' && location==='grid'`; each tile has teacherId, period, subject, classIds, venue and group. Pit cards do not occupy a room. Baseline tiles are evidence, not extra simultaneous bookings. The confirmed plan replaces that date's baseline occupation. For a legacy confirmed row that cannot prove an immutable snapshot, mark coverage unavailable and request reconfirmation.

Confirmed but unpublished display label is fixed `Suspended timetable`. Exclude plan name, free text, card subject or absence information from that projection. `confirmedStaplerProjection` is not a sufficient privacy boundary because it still returns a full plan with names and other detail.

### Published daily changes

`state.dailyPublicationStates[date]` is the authoritative frozen daily publication. It has `baselineId`, `revision`, `sourceRevision`, `staplerRevision`, `periods`, `teachers`, and `publicReliefRows`. A teacher entry has `staffId`, `cells`, `baseline`, rows and notice metadata. **Only changed teachers are stored**. Start from complete effective baseline/confirmed cells and overlay these changed rows after resolving internal stable teacher identity.

`GSISRosterOperations.timetableDay` is a viewer overlay, not a complete source export: with no STAPLER it returns baseline source and `teachers:[]`, even when a daily publication contains baseline relief changes. Do not use it as the sole occupancy source.

Do not free a room merely because an absent teacher's published cell becomes `['Absent','','','']`. `publication.publicReliefRows` retains lesson demand with period, className, venue and `status: assigned|unassigned|no-relief`; unassigned supervision still occupies its lesson room. Build lesson occupation, not present-teacher occupation.

For combined/moved classes, use structured publication evidence. `state.publicationSnapshots` holds immutable `{id,assignmentId,revision,staffId,date,period,kind,assignment}`; assignment retains `combination`, `originalLesson`, `venue`, source lesson and participant IDs. Link through the current publication's teacher `snapshotIds` so stale/cancelled history cannot override it. A joined human-display venue string containing ` + ` is not itself a stable room ID. If structured evidence cannot prove which room was released, retain the source hold and surface unresolved coverage instead of guessing.

Source fingerprint must include frozen publication content, not just date names. Do not observe mutable absences/working allocation drafts as published room changes. Draft source title edits must not trigger full timetable downloads.

## External sources

* `backend/Contacts_Lord.gs::lordContactsService_` already produces the minimal server-only people catalogue: stable id, name, active, email, cesEmail, statutoryName, mobile. It validates a before/after freshness marker. Reuse projection logic through a distinct Venues service authentication boundary and secret; do not share LORD credentials by default.
* `backend/LordDeploy.gs::lordDeployService_` exports frozen published classes, subjects and TGs, not rooms.
* `backend/LayoutRepository.gs::publicLayout_` provides a checked immutable room catalogue and current handoff status. `shared/layout-data.js::publicView` gives venue `id,unitNumber,geometryUnit,name,shortName,block,level,capacity`. `syncLayoutPublication_` generates IDs with the year, so these are aliases, not permanent cross-year booking identity. Venues needs its own permanent venue ID and effective alias table.
* `calendar-backend/RosterDate.gs::apiRosterDates_` accepts at most 62 dates. It checks release state freshly and returns schoolDay/parity. Add a constrained year/manifest Venues source service rather than issuing a full year of batches on every booking. Calendar core service gate currently permits only `gsis-roster-notifier-v1` for these reads.

## Atomic storage

Use one Advanced Sheets `Sheets.Spreadsheets.batchUpdate` for occurrence changes, receipt, audit, outbox and revision. LORD's `commitSurgicalUpdates_` and its literal-cell helpers provide a tested pattern. Do not reuse `GSISSheets.write` and call the complete operation atomic: it may split large payloads into several Values batches. Prepare/validate size before mutation and retain ambiguous outcomes for receipt reconciliation.

No idempotency properties per booking. A fixed metadata pointer/property is acceptable; durable receipts and queue records belong in tables. Do not prune unresolved or active holds to satisfy size limits.

## Required tests

1. Baseline upload/metadata/activate/prune/restore and every effective STAPLER/publication mutation enters the fence; no-op receipt/notification writes do not.
2. Begin succeeds but response is lost, source commit fails, end response is lost, and stale completion arrives after a newer begin: new booking remains blocked until verified recovery.
3. Snapshot prepared before a source change cannot activate afterward; newer generation cannot be demoted.
4. Two simultaneous identical interval bookings yield one confirmed/pending hold; adjacent half-open intervals both succeed.
5. Full year includes holidays/weekends as verified empty; missing baseline/parity/year is explicit unavailable.
6. Unmatched Contacts teacher's baseline room remains occupied; duplicate aliases or unknown venue strings cannot produce free space.
7. Unconfirmed post-confirmation draft does not affect occupancy; confirmed unpublished plan contains only fixed safe labels.
8. Baseline-only published relief is included; absent teacher without replacement does not free room; structured combine/move/cancellation uses only current publication evidence.
9. Room rename/year rollover preserves permanent venue IDs and past bookings.
10. Booking admission during source begin/end/recovery never accepts a stale ready source. Test pending hold retention and atomic displacement/audit/outbox transitions.

## STAPLER cap warning investigation added 25 October 2026

Screenshot investigation is independent of the Venues implementation. `roster-stapler-ui.js::drawPlanningNotes` prints `periodCap` only for `weekly-cap-exceeded`; its unverified branch drops a known cap. Backend `validateStaplerCaps` already returns `periodCap` with `weeklyTotal:null`, and only emits this warning for a configured cap. The screenshot therefore distinguishes a verified total from an unverified total; it does not prove the cap is missing.

UT's default cap is 26 total actual weekly periods including non-teaching (shared/teaching-rules.js). A saved cap may differ; never infer 26 from a name containing UT. `rosterOperationsQuotaTeacher_` becomes unverified if Deploy cannot certify its row, cap/basis is invalid, any weekday baseline/name match is missing, total-workload reservations are missing, or an activity cannot be classified. `composeStaplerContext` also invalidates a cap for unknown suspended-plan activities or invalid resulting totals. Existing code discards the detailed reason.

Smallest visible correction: show `Weekly workload could not be verified. Configured cap: 26 periods.` whenever the warning contains a finite cap; otherwise explicitly say the configured cap is unavailable. For useful diagnosis carry a structured reason from the failing source, including unknown activity codes or missing weekday identity, without exposing unrelated staff data. Keep conservative allocation and imported-plan warning policy unchanged. The exact reason for Kavitha/Fazdriel needs current source data; local fixtures and screenshot cannot establish it.
